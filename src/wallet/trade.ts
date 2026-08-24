import {
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  formatUnits,
  formatEther,
  type Address,
  type Chain,
} from "viem";
import { getKernelClient } from "./zerodev";
import { config } from "../config";
import { chainCtx, detectChainForToken, type ChainCtx } from "../chains";
import { recordTx } from "./history";

const FEE_TIERS = [500, 3000, 10000] as const;

const swapRouterAbi = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const quoterAbi = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const wethAbi = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

/** Pick the chain a token actually trades on, unless one was forced. */
export async function resolveTradeChain(
  token: Address,
  explicit?: Chain,
): Promise<{ chain: Chain; detected: boolean; note?: string }> {
  if (explicit) return { chain: explicit, detected: false };

  const { hit, nonEvmOnly } = await detectChainForToken(token);
  if (hit) {
    return {
      chain: hit.chain,
      detected: true,
      note: `${hit.symbol} on ${hit.chain.name} (liq $${Math.round(hit.liquidityUsd ?? 0).toLocaleString("en-US")})`,
    };
  }
  if (nonEvmOnly?.length) {
    throw new Error(
      `This token only trades on ${nonEvmOnly.join(", ")}, which is not EVM. ZeroDev cannot sign there.`,
    );
  }
  return { chain: config.chain, detected: false, note: "no market data - using default chain" };
}

function requireDex(ctx: ChainCtx): NonNullable<ChainCtx["preset"]> {
  if (!ctx.preset) {
    throw new Error(
      `No Uniswap V3 deployment configured for ${ctx.name} (chain ${ctx.chainId}).`,
    );
  }
  return ctx.preset;
}

async function bestQuote(
  ctx: ChainCtx,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<{ fee: number; amountOut: bigint }> {
  const preset = requireDex(ctx);
  let best = { fee: 0, amountOut: 0n };
  for (const fee of FEE_TIERS) {
    try {
      const { result } = await ctx.publicClient.simulateContract({
        address: preset.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      } as any);
      const out = (result as readonly bigint[])[0];
      if (out > best.amountOut) best = { fee, amountOut: out };
    } catch {
      /* no pool at this tier */
    }
  }
  if (best.amountOut === 0n) {
    throw new Error(`No Uniswap V3 pool with liquidity on ${ctx.name} for this pair.`);
  }
  return best;
}

function applySlippage(amountOut: bigint): bigint {
  const bps = BigInt(Math.max(0, Math.min(config.slippageBps, 5000)));
  return (amountOut * (10000n - bps)) / 10000n;
}

export async function getBalances(
  smartAddress: Address,
  token?: Address,
  chain: Chain = config.chain,
) {
  const ctx = chainCtx(chain);
  const native = await ctx.publicClient.getBalance({ address: smartAddress });
  const result: {
    chain: string;
    native: string;
    token?: { address: Address; symbol: string; balance: string };
  } = { chain: ctx.name, native: formatEther(native) };

  if (token) {
    const [bal, dec, sym] = await Promise.all([
      ctx.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [smartAddress] }),
      ctx.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      ctx.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    ]);
    result.token = {
      address: token,
      symbol: sym as string,
      balance: formatUnits(bal as bigint, dec as number),
    };
  }
  return result;
}

export type SwapResult = {
  txHash: `0x${string}`;
  fee: number;
  expectedOut: bigint;
  minOut: bigint;
  chainName: string;
  chainId: number;
  explorerTx: string;
  detected: boolean;
  note?: string;
};

/** BUY: native -> token. Chain is auto-detected from the token unless forced. */
export async function buyToken(
  userId: number,
  tokenOut: Address,
  amountInEth: string,
  forceChain?: Chain,
): Promise<SwapResult> {
  const { chain, detected, note } = await resolveTradeChain(tokenOut, forceChain);
  const { kernelClient, smartAddress, ctx } = await getKernelClient(userId, chain);
  const preset = requireDex(ctx);

  const amountIn = parseUnits(amountInEth, 18);
  const { fee, amountOut } = await bestQuote(ctx, preset.weth, tokenOut, amountIn);
  const minOut = applySlippage(amountOut);

  const calls = [
    {
      to: preset.weth,
      value: amountIn,
      data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }),
    },
    {
      to: preset.weth,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [preset.router, amountIn],
      }),
    },
    {
      to: preset.router,
      value: 0n,
      data: encodeFunctionData({
        abi: swapRouterAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: preset.weth,
            tokenOut,
            fee,
            recipient: smartAddress,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
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
  recordTx(userId, { type: "buy", token: tokenOut, amount: `${amountInEth} on ${ctx.name}`, txHash });

  return {
    txHash,
    fee,
    expectedOut: amountOut,
    minOut,
    chainName: ctx.name,
    chainId: ctx.chainId,
    explorerTx: ctx.explorerTx,
    detected,
    note,
  };
}

/** SELL: token -> WETH. Chain auto-detected from the token unless forced. */
export async function sellToken(
  userId: number,
  tokenIn: Address,
  amountInToken: string,
  forceChain?: Chain,
): Promise<SwapResult> {
  const { chain, detected, note } = await resolveTradeChain(tokenIn, forceChain);
  const { kernelClient, smartAddress, ctx } = await getKernelClient(userId, chain);
  const preset = requireDex(ctx);

  const dec = (await ctx.publicClient.readContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: "decimals",
  })) as number;
  const amountIn = parseUnits(amountInToken, dec);

  const { fee, amountOut } = await bestQuote(ctx, tokenIn, preset.weth, amountIn);
  const minOut = applySlippage(amountOut);

  const calls = [
    {
      to: tokenIn,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [preset.router, amountIn],
      }),
    },
    {
      to: preset.router,
      value: 0n,
      data: encodeFunctionData({
        abi: swapRouterAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut: preset.weth,
            fee,
            recipient: smartAddress,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
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
  recordTx(userId, { type: "sell", token: tokenIn, amount: `${amountInToken} on ${ctx.name}`, txHash });

  return {
    txHash,
    fee,
    expectedOut: amountOut,
    minOut,
    chainName: ctx.name,
    chainId: ctx.chainId,
    explorerTx: ctx.explorerTx,
    detected,
    note,
  };
}
