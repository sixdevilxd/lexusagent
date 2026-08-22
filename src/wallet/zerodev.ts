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

export const publicClient = createPublicClient({
  chain: config.chain,
  transport: http(config.rpcUrl),
});

/** Build a ZeroDev kernel (smart account) client for a given Telegram user. */
export async function getKernelClient(userId: number) {
  const signer = privateKeyToAccount(getPrivateKey(userId));

  // ZeroDev API v3 exposes ONE RPC URL that serves both bundler and paymaster:
  //   https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/<CHAIN_ID>
  // The separate *_BUNDLER_RPC / *_PAYMASTER_RPC vars remain as optional overrides.
  const bundlerRpc = config.zerodev.bundlerRpc || config.zerodev.rpc;
  const paymasterRpc = config.zerodev.paymasterRpc || config.zerodev.rpc;

  if (!bundlerRpc) {
    throw new Error(
      "ZERODEV_RPC not set in .env — get it from https://dashboard.zerodev.app",
    );
  }

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  });

  const paymasterClient = paymasterRpc
    ? createZeroDevPaymasterClient({
        chain: config.chain,
        transport: http(paymasterRpc),
      })
    : undefined;

  const kernelClient = createKernelAccountClient({
    account,
    chain: config.chain,
    // Required by the current SDK — the public client.
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
