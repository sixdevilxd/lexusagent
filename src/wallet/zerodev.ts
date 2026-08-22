import { http, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { config } from "../config";
import { getPrivateKey } from "./store";

// NOTE: ZeroDev SDK evolves quickly. If an import/signature breaks,
// check the current docs at https://docs.zerodev.app and adjust.
const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

/**
 * Account-abstraction reads MUST go through an RPC that preserves revert data.
 * Deriving a smart account address calls EntryPoint.getSenderAddress(), which
 * intentionally reverts with the address inside the revert payload. Many public
 * endpoints (e.g. sepolia.base.org) strip that payload, which makes the SDK
 * throw "Cannot read properties of undefined (reading 'match')".
 *
 * The ZeroDev RPC proxies standard JSON-RPC and keeps revert data, so we prefer
 * it and fall back to RPC_URL only when ZeroDev is not configured.
 */
const aaRpc = config.zerodev.rpc || config.rpcUrl;

export const publicClient = createPublicClient({
  chain: config.chain,
  transport: http(aaRpc),
});

/** Build a ZeroDev kernel (smart account) client for a given Telegram user. */
export async function getKernelClient(userId: number) {
  const bundlerRpc = config.zerodev.bundlerRpc || config.zerodev.rpc;
  const paymasterRpc = config.zerodev.paymasterRpc || config.zerodev.rpc;

  if (!bundlerRpc) {
    throw new Error(
      "ZeroDev is not configured. Set ZERODEV_PROJECT_ID in .env — see ZERODEV.md",
    );
  }

  const signer = privateKeyToAccount(getPrivateKey(userId));

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });

  let account;
  try {
    account = await createKernelAccount(publicClient, {
      plugins: { sudo: ecdsaValidator },
      entryPoint,
      kernelVersion,
    });
  } catch (e: any) {
    const detail = e?.shortMessage ?? e?.message ?? String(e);
    throw new Error(
      `Could not derive the smart account on ${config.chainName} (chain ${config.chainId}).\n` +
        `Likely causes:\n` +
        `1. Your ZeroDev project is not enabled for this chain — the project's network must match CHAIN.\n` +
        `2. ZERODEV_PROJECT_ID is wrong or the RPC is unreachable.\n` +
        `3. RPC strips revert data (only applies when ZeroDev is not configured).\n` +
        `RPC in use: ${aaRpc.replace(/\/api\/v3\/[^/]+/, "/api/v3/***")}\n` +
        `Original error: ${detail}`,
    );
  }

  const paymasterClient = paymasterRpc
    ? createZeroDevPaymasterClient({
        chain: config.chain,
        transport: http(paymasterRpc),
      })
    : undefined;

  const kernelClient = createKernelAccountClient({
    account,
    chain: config.chain,
    client: publicClient,
    bundlerTransport: http(bundlerRpc),
    ...(paymasterClient
      ? {
          paymaster: {
            getPaymasterData: (userOperation: any) =>
              paymasterClient.sponsorUserOperation({ userOperation }),
          },
        }
      : {}),
  });

  return {
    account,
    kernelClient,
    smartAddress: account.address as `0x${string}`,
  };
}
