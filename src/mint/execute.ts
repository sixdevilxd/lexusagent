import { parseEther } from "viem";
import { getKernelClient } from "../wallet/zerodev";
import { config } from "../config";
import { encodeMint, type MintParams } from "./launchpad";
import { recordTx } from "../wallet/history";

/** Sign & execute a token mint as a UserOperation via the ZeroDev smart account. */
export async function executeMint(
  userId: number,
  p: MintParams,
): Promise<`0x${string}`> {
  if (!config.mint.factory) {
    throw new Error("TOKEN_FACTORY_ADDRESS not set in .env");
  }
  const { kernelClient } = await getKernelClient(userId);
  const data = encodeMint(p);

  const value =
    p.valueEth != null && p.valueEth !== ""
      ? parseEther(p.valueEth)
      : config.mint.creationFeeEth
        ? parseEther(config.mint.creationFeeEth)
        : 0n;

  const hash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      { to: config.mint.factory, value, data },
    ]),
  });
  const receipt = await kernelClient.waitForUserOperationReceipt({ hash });
  const txHash = receipt.receipt.transactionHash as `0x${string}`;
  recordTx(userId, {
    type: "mint",
    token: p.symbol,
    amount: `${p.name} (${p.supply})`,
    txHash,
  });
  return txHash;
}
