import { privateKeyToAccount } from "viem/accounts";
import { http, type Chain } from "viem";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { config } from "../config";
import { chainCtx, zerodevRpcFor, type ChainCtx } from "../chains";
import { getPrivateKey } from "./store";

const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

/** Public client for the default chain (kept for backwards compatibility). */
export const publicClient = chainCtx(config.chain).publicClient;

export type KernelBundle = {
  account: any;
  kernelClient: any;
  smartAddress: `0x${string}`;
  ctx: ChainCtx;
};

/**
 * Build a ZeroDev kernel client for a user on ANY EVM chain.
 * The smart-account address is deterministic from the signer, so it is the
 * same address on every chain.
 */
export async function getKernelClient(
  userId: number,
  chain: Chain = config.chain,
): Promise<KernelBundle> {
  const ctx = chainCtx(chain);
  const rpc = zerodevRpcFor(ctx.chainId);

  if (!rpc) {
    throw new Error(
      "ZeroDev is not configured. Set ZERODEV_PROJECT_ID in .env - see ZERODEV.md",
    );
  }

  const bundlerRpc = config.zerodev.bundlerRpc || rpc;
  const paymasterRpc = config.zerodev.paymasterRpc || rpc;
  const signer = privateKeyToAccount(getPrivateKey(userId));

  const ecdsaValidator = await signerToEcdsaValidator(ctx.publicClient as any, {
    signer,
    entryPoint,
    kernelVersion,
  });

  let account;
  try {
    account = await createKernelAccount(ctx.publicClient as any, {
      plugins: { sudo: ecdsaValidator },
      entryPoint,
      kernelVersion,
    });
  } catch (e: any) {
    const detail = e?.shortMessage ?? e?.message ?? String(e);
    throw new Error(
      `Could not derive the smart account on ${ctx.name} (chain ${ctx.chainId}).\n` +
        `Most likely your ZeroDev project does not have ${ctx.name} enabled - ` +
        `add it at dashboard.zerodev.app, then set a Gas Policy for it.\n` +
        `Original: ${detail}`,
    );
  }

  const paymasterClient = paymasterRpc
    ? createZeroDevPaymasterClient({ chain, transport: http(paymasterRpc) })
    : undefined;

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    client: ctx.publicClient as any,
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
    ctx,
  };
}
