import { encodeFunctionData, erc20Abi, parseUnits, type Address } from "viem";
import { publicClient, getKernelClient } from "./zerodev";
import { config } from "../config";
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
};

/**
 * Provide full-range liquidity to a Uniswap V3 <token>/WETH pool.
 * Wraps native -> WETH, approves both sides and mints the position in ONE UserOperation.
 * The pool must already exist.
 */
export async function provideLiquidity(
  userId: number,
  token: Address,
  amountNative: string,
  amountToken: string,
  fee = 3000,
): Promise<LpResult> {
  if (!config.wethAddress || !config.factory || !config.positionManager) {
    throw new Error(
      `Uniswap V3 not configured for ${config.chainName} (chain ${config.chainId}).`,
    );
  }
  if (!TICK_SPACING[fee]) {
    throw new Error(`Invalid fee tier ${fee}. Use 100, 500, 3000 or 10000.`);
  }

  const pool = (await publicClient.readContract({
    address: config.factory,
    abi: factoryAbi,
    functionName: "getPool",
    args: [config.wethAddress, token, fee],
  })) as Address;

  if (!pool || /^0x0{40}$/i.test(pool)) {
    throw new Error(
      `No Uniswap V3 pool for this pair at the ${fee / 10000}% fee tier. Try another tier.`,
    );
  }

  const { kernelClient, smartAddress } = await getKernelClient(userId);

  const decimals = (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  })) as number;

  const wethAmount = parseUnits(amountNative, 18);
  const tokenAmount = parseUnits(amountToken, decimals);

  // Uniswap requires token0 < token1 by address
  const wethIsToken0 = config.wethAddress.toLowerCase() < token.toLowerCase();
  const token0 = wethIsToken0 ? config.wethAddress : token;
  const token1 = wethIsToken0 ? token : config.wethAddress;
  const amount0 = wethIsToken0 ? wethAmount : tokenAmount;
  const amount1 = wethIsToken0 ? tokenAmount : wethAmount;

  const { tickLower, tickUpper } = fullRange(fee);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const calls = [
    // wrap native
    {
      to: config.wethAddress,
      value: wethAmount,
      data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }),
    },
    // approve both sides to the position manager
    {
      to: config.wethAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [config.positionManager, wethAmount],
      }),
    },
    {
      to: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [config.positionManager, tokenAmount],
      }),
    },
    // mint the position
    {
      to: config.positionManager,
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
    amount: `${amountNative} native + ${amountToken} token`,
    txHash,
  });

  return { txHash, fee, pool, amountNative, amountToken };
}
