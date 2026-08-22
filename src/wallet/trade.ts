import {
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  formatUnits,
  formatEther,
  type Address,
} from "viem";
import { publicClient, getKernelClient } from "./zerodev";
import { config } from "../config";
import { recordTx } from "./history";

const FEE_TIERS = [500, 3000, 10000] as const;

// Uniswap V3 SwapRouter02
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

// Uniswap V3 QuoterV2 (non-view: must be simulated)
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
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

function requireDex(): void {
  if (!config.dexRouter || !config.wethAddress || !config.quoter) {
    throw new Error(
      `DEX not configured for ${config.chainName} (chain ${config.chainId}). ` +
        "Set DEX_ROUTER, QUOTER_ADDRESS and WETH_ADDRESS in .env",
    );
  }
}

/** Quote across all fee tiers and return the deepest pool. */
async function bestQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<{ fee: number; amountOut: bigint }> {
  let best = { fee: 0, amountOut: 0n };
  for (const fee of FEE_TIERS) {
    try {
      const { result } = await publicClient.simulateContract({
        address: config.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const out = (result as readonly bigint[])[0];
      if (out > best.amountOut) best = { fee, amountOut: out };
    } catch {
      // no pool at this fee tier
    }
  }
  if (best.amountOut === 0n) {
    throw new Error("No Uniswap V3 pool with liquidity found for this pair");
  }
  return best;
}

function applySlippage(amountOut: bigint): bigint {
  const bps = BigInt(Math.max(0, Math.min(config.slippageBps, 5000)));
  return (amountOut * (10000n - bps)) / 10000n;
}

export async function getBalances(smartAddress: Address, token?: Address) {
  const native = await publicClient.getBalance({ address: smartAddress });
  const result: {
    native: string;
    token?: { address: Address; symbol: string; balance: string };
  } = { native: formatEther(native) };

  if (token) {
    const [bal, dec, sym] = await Promise.all([
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [smartAddress] }),
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
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
};

/**
 * BUY: native -> token.
 * Wraps the native amount to WETH and swaps it in one UserOperation,
 * so no pre-existing WETH balance is needed.
 */
export async function buyToken(
  userId: number,
  tokenOut: Address,
  amountInEth: string,
): Promise<SwapResult> {
  requireDex();
  const { kernelClient, smartAddress } = await getKernelClient(userId);
  const amountIn = parseUnits(amountInEth, 18);

  const { fee, amountOut } = await bestQuote(config.wethAddress, tokenOut, amountIn);
  const minOut = applySlippage(amountOut);

  const calls = [
    {
      to: config.wethAddress,
      value: amountIn,
      data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }),
    },
    {
      to: config.wethAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [config.dexRouter, amountIn],
      }),
    },
    {
      to: config.dexRouter,
      value: 0n,
      data: encodeFunctionData({
        abi: swapRouterAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: config.wethAddress,
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
  recordTx(userId, { type: "buy", token: tokenOut, amount: amountInEth, txHash });
  return { txHash, fee, expectedOut: amountOut, minOut };
}

/** SELL: token -> WETH. */
export async function sellToken(
  userId: number,
  tokenIn: Address,
  amountInToken: string,
): Promise<SwapResult> {
  requireDex();
  const { kernelClient, smartAddress } = await getKernelClient(userId);
  const dec = (await publicClient.readContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: "decimals",
  })) as number;
  const amountIn = parseUnits(amountInToken, dec);

  const { fee, amountOut } = await bestQuote(tokenIn, config.wethAddress, amountIn);
  const minOut = applySlippage(amountOut);

  const calls = [
    {
      to: tokenIn,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [config.dexRouter, amountIn],
      }),
    },
    {
      to: config.dexRouter,
      value: 0n,
      data: encodeFunctionData({
        abi: swapRouterAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut: config.wethAddress,
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
  recordTx(userId, { type: "sell", token: tokenIn, amount: amountInToken, txHash });
  return { txHash, fee, expectedOut: amountOut, minOut };
}
