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

  const paymasterClient = config.zerodev.paymasterRpc
    ? createZeroDevPaymasterClient({
        chain: config.chain,
        transport: http(config.zerodev.paymasterRpc),
      })
    : undefined;

  const kernelClient = createKernelAccountClient({
    account,
    chain: config.chain,
    bundlerTransport: http(config.zerodev.bundlerRpc || config.rpcUrl),
    ...(paymasterClient
      ? {
          paymaster: {
            getPaymasterData: (userOp: any) =>
              paymasterClient.sponsorUserOperation({ userOperation: userOp }),
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
