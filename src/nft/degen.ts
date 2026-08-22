import { encodeFunctionData, parseEther, parseAbi, type Address } from "viem";
import { publicClient, getKernelClient } from "../wallet/zerodev";
import { config } from "../config";
import { recordTx } from "../wallet/history";

/**
 * Degen NFT minter.
 *
 * Mint functions are not standardised, so we probe the common signatures with
 * a gas estimation and use the first one that does not revert.
 */
const CANDIDATES = [
  {
    label: "mint(uint256)",
    abi: parseAbi(["function mint(uint256 quantity) payable"]),
    fn: "mint",
    args: (_to: Address, qty: number) => [BigInt(qty)],
  },
  {
    label: "mint(address,uint256)",
    abi: parseAbi(["function mint(address to, uint256 quantity) payable"]),
    fn: "mint",
    args: (to: Address, qty: number) => [to, BigInt(qty)],
  },
  {
    label: "publicMint(uint256)",
    abi: parseAbi(["function publicMint(uint256 quantity) payable"]),
    fn: "publicMint",
    args: (_to: Address, qty: number) => [BigInt(qty)],
  },
  {
    label: "mintPublic(uint256)",
    abi: parseAbi(["function mintPublic(uint256 quantity) payable"]),
    fn: "mintPublic",
    args: (_to: Address, qty: number) => [BigInt(qty)],
  },
  {
    label: "safeMint(address)",
    abi: parseAbi(["function safeMint(address to) payable"]),
    fn: "safeMint",
    args: (to: Address) => [to],
  },
  {
    label: "mint()",
    abi: parseAbi(["function mint() payable"]),
    fn: "mint",
    args: () => [],
  },
] as const;

export type MintNftResult = {
  txHash: `0x${string}`;
  signature: string;
  quantity: number;
  valueEth: string;
};

/**
 * Mint from an NFT contract. Auto-detects the mint signature.
 * `priceEth` is the price PER ITEM; total value = priceEth * quantity.
 */
export async function mintNft(
  userId: number,
  contract: Address,
  quantity = 1,
  priceEth = "0",
): Promise<MintNftResult> {
  const { kernelClient, smartAddress } = await getKernelClient(userId);
  const perItem = parseEther(priceEth);
  const value = perItem * BigInt(quantity);

  let chosen: { data: `0x${string}`; label: string } | null = null;
  const errors: string[] = [];

  for (const c of CANDIDATES) {
    try {
      const args = (c.args as any)(smartAddress, quantity);
      await publicClient.estimateContractGas({
        address: contract,
        abi: c.abi as any,
        functionName: c.fn as any,
        args,
        account: smartAddress,
        value,
      });
      chosen = {
        data: encodeFunctionData({ abi: c.abi as any, functionName: c.fn as any, args }),
        label: c.label,
      };
      break;
    } catch (e: any) {
      errors.push(`${c.label}: ${(e?.shortMessage ?? e?.message ?? "revert").slice(0, 80)}`);
    }
  }

  if (!chosen) {
    throw new Error(
      "No known mint function succeeded. Tried:\n" +
        errors.join("\n") +
        "\nCheck the price, quantity, mint phase or allowlist.",
    );
  }

  const hash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      { to: contract, value, data: chosen.data },
    ]),
  });
  const receipt = await kernelClient.waitForUserOperationReceipt({ hash });
  const txHash = receipt.receipt.transactionHash as `0x${string}`;

  recordTx(userId, {
    type: "nft",
    token: contract,
    amount: `${quantity}x @ ${priceEth}`,
    txHash,
  });

  return { txHash, signature: chosen.label, quantity, valueEth: priceEth };
}

/** Basic collection info for the confirmation preview. */
export async function nftInfo(contract: Address) {
  const abi = parseAbi([
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function maxSupply() view returns (uint256)",
  ]);
  const read = async (fn: string) => {
    try {
      return await publicClient.readContract({
        address: contract,
        abi,
        functionName: fn as any,
      });
    } catch {
      return null;
    }
  };
  const [name, symbol, total, max] = await Promise.all([
    read("name"),
    read("symbol"),
    read("totalSupply"),
    read("maxSupply"),
  ]);
  return {
    name: (name as string) ?? "?",
    symbol: (symbol as string) ?? "?",
    totalSupply: total != null ? String(total) : "?",
    maxSupply: max != null ? String(max) : "?",
    chain: config.chainName,
  };
}
