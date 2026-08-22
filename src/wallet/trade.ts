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

// Uniswap V3 SwapRouter02: exactInputSingle
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

/** BUY: swap WETH -> tokenOut. Smart account must hold WETH. */
export async function buyToken(
  userId: number,
  tokenOut: Address,
  amountInEth: string,
  feeTier = 3000,
): Promise<`0x${string}`> {
  if (!config.dexRouter || !config.wethAddress) {
    throw new Error("DEX_ROUTER / WETH_ADDRESS not configured in .env");
  }
  const { kernelClient, smartAddress } = await getKernelClient(userId);
  const amountIn = parseUnits(amountInEth, 18);

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [config.dexRouter, amountIn],
  });
  const swapData = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: config.wethAddress,
        tokenOut,
        fee: feeTier,
        recipient: smartAddress,
        amountIn,
        amountOutMinimum: 0n, // TODO: compute from a quoter + slippageBps
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  const hash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      { to: config.wethAddress, value: 0n, data: approveData },
      { to: config.dexRouter, value: 0n, data: swapData },
    ]),
  });
  const receipt = await kernelClient.waitForUserOperationReceipt({ hash });
  const txHash = receipt.receipt.transactionHash as `0x${string}`;
  recordTx(userId, { type: "buy", token: tokenOut, amount: amountInEth, txHash });
  return txHash;
}

/** SELL: swap tokenIn -> WETH. */
export async function sellToken(
  userId: number,
  tokenIn: Address,
  amountInToken: string,
  feeTier = 3000,
): Promise<`0x${string}`> {
  if (!config.dexRouter || !config.wethAddress) {
    throw new Error("DEX_ROUTER / WETH_ADDRESS not configured in .env");
  }
  const { kernelClient, smartAddress } = await getKernelClient(userId);
  const dec = (await publicClient.readContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: "decimals",
  })) as number;
  const amountIn = parseUnits(amountInToken, dec);

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [config.dexRouter, amountIn],
  });
  const swapData = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut: config.wethAddress,
        fee: feeTier,
        recipient: smartAddress,
        amountIn,
        amountOutMinimum: 0n, // TODO: compute from a quoter + slippageBps
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  const hash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      { to: tokenIn, value: 0n, data: approveData },
      { to: config.dexRouter, value: 0n, data: swapData },
    ]),
  });
  const receipt = await kernelClient.waitForUserOperationReceipt({ hash });
  const txHash = receipt.receipt.transactionHash as `0x${string}`;
  recordTx(userId, { type: "sell", token: tokenIn, amount: amountInToken, txHash });
  return txHash;
}
