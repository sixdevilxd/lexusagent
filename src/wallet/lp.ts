import { encodeFunctionData, erc20Abi, parseUnits, type Address, type Chain } from "viem";
import { getKernelClient } from "./zerodev";
import { config } from "../config";
import { chainCtx, detectChainForToken, type ChainCtx } from "../chains";
import { recordTx } from "./history";

const TICK_SPACING: Record<number, number> = { 100: 1, 500: 10, 3000: 60, 10000: 200 };
const MIN_TICK = -887272;
const MAX_TICK = 887272;

const factoryAbi = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

const positionManagerAbi = [
  {
    name: "mint",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
] as const;

const wethAbi = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

function fullRange(fee: number): { tickLower: number; tickUpper: number } {
  const s = TICK_SPACING[fee] ?? 60;
  return {
    tickLower: Math.ceil(MIN_TICK / s) * s,
    tickUpper: Math.floor(MAX_TICK / s) * s,
  };
}

function withSlippage(v: bigint): bigint {
  const bps = BigInt(Math.max(0, Math.min(config.slippageBps, 5000)));
  return (v * (10000n - bps)) / 10000n;
}

export type LpResult = {
  txHash: `0x${string}`;
  fee: number;
  pool: Address;
  amountNative: string;
  amountToken: string;
  chainName: string;
  explorerTx: string;
  detected: boolean;
};

/**
 * Provide full-range liquidity to a token/WETH pool.
 * The chain is auto-detected from where the token has the deepest liquidity,
 * unless one is forced.
 */
export async function provideLiquidity(
  userId: number,
  token: Address,
  amountNative: string,
  amountToken: string,
  fee = 3000,
  forceChain?: Chain,
): Promise<LpResult> {
  if (!TICK_SPACING[fee]) {
    throw new Error(`Invalid fee tier ${fee}. Use 100, 500, 3000 or 10000.`);
  }

  let chain = forceChain ?? config.chain;
  let detected = false;
  if (!forceChain) {
    const { hit, nonEvmOnly } = await detectChainForToken(token);
    if (hit) {
      chain = hit.chain;
      detected = true;
    } else if (nonEvmOnly?.length) {
      throw new Error(
        `Token only trades on ${nonEvmOnly.join(", ")}, which is not EVM.`,
      );
    }
  }

  const ctx: ChainCtx = chainCtx(chain);
  if (!ctx.preset) {
    throw new Error(`No Uniswap V3 deployment configured for ${ctx.name}.`);
  }
  const { weth, factory, positionManager } = ctx.preset;

  const pool = (await ctx.publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "getPool",
    args: [weth, token, fee],
  })) as Address;

  if (!pool || /^0x0{40}$/i.test(pool)) {
    throw new Error(
      `No pool on ${ctx.name} at the ${fee / 10000}% fee tier. Try another tier.`,
    );
  }

  const { kernelClient, smartAddress } = await getKernelClient(userId, chain);

  const decimals = (await ctx.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  })) as number;

  const wethAmount = parseUnits(amountNative, 18);
  const tokenAmount = parseUnits(amountToken, decimals);

  const wethIsToken0 = weth.toLowerCase() < token.toLowerCase();
  const token0 = wethIsToken0 ? weth : token;
  const token1 = wethIsToken0 ? token : weth;
  const amount0 = wethIsToken0 ? wethAmount : tokenAmount;
  const amount1 = wethIsToken0 ? tokenAmount : wethAmount;

  const { tickLower, tickUpper } = fullRange(fee);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const calls = [
    {
      to: weth,
      value: wethAmount,
      data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }),
    },
    {
      to: weth,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [positionManager, wethAmount],
      }),
    },
    {
      to: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [positionManager, tokenAmount],
      }),
    },
    {
      to: positionManager,
      value: 0n,
      data: encodeFunctionData({
        abi: positionManagerAbi,
        functionName: "mint",
        args: [
          {
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: withSlippage(amount0),
            amount1Min: withSlippage(amount1),
            recipient: smartAddress,
            deadline,
          },
        ],
      }),
    },
  ];

  const hash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls(calls),
  });
  const receipt = await kernelClient.waitForUserOperationReceipt({ hash });
  const txHash = receipt.receipt.transactionHash as `0x${string}`;

  recordTx(userId, {
    type: "lp",
    token,
    amount: `${amountNative} + ${amountToken} on ${ctx.name}`,
    txHash,
  });

  return {
    txHash,
    fee,
    pool,
    amountNative,
    amountToken,
    chainName: ctx.name,
    explorerTx: ctx.explorerTx,
    detected,
  };
}
