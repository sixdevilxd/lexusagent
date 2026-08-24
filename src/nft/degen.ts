import { encodeFunctionData, parseEther, parseAbi, type Address } from "viem";
import { publicClient, getKernelClient } from "../wallet/zerodev";
import { config } from "../config";
import { recordTx } from "../wallet/history";

export type MintExtras = {
  proof?: string[];
  signature?: string;
};

type Candidate = {
  label: string;
  abi: any;
  fn: string;
  args: (to: Address, qty: number, x: MintExtras) => any[];
  needs?: "proof" | "signature";
};

/** Allowlist / proof-aware signatures are tried first when we have a proof. */
const CANDIDATES: Candidate[] = [
  {
    label: "mint(uint256,bytes32[])",
    abi: parseAbi(["function mint(uint256 quantity, bytes32[] proof) payable"]),
    fn: "mint",
    args: (_t, q, x) => [BigInt(q), x.proof ?? []],
    needs: "proof",
  },
  {
    label: "allowlistMint(uint256,bytes32[])",
    abi: parseAbi(["function allowlistMint(uint256 quantity, bytes32[] proof) payable"]),
    fn: "allowlistMint",
    args: (_t, q, x) => [BigInt(q), x.proof ?? []],
    needs: "proof",
  },
  {
    label: "mintAllowList(uint256,bytes32[])",
    abi: parseAbi(["function mintAllowList(uint256 quantity, bytes32[] proof) payable"]),
    fn: "mintAllowList",
    args: (_t, q, x) => [BigInt(q), x.proof ?? []],
    needs: "proof",
  },
  {
    label: "whitelistMint(uint256,bytes32[])",
    abi: parseAbi(["function whitelistMint(uint256 quantity, bytes32[] proof) payable"]),
    fn: "whitelistMint",
    args: (_t, q, x) => [BigInt(q), x.proof ?? []],
    needs: "proof",
  },
  {
    label: "mint(bytes32[],uint256)",
    abi: parseAbi(["function mint(bytes32[] proof, uint256 quantity) payable"]),
    fn: "mint",
    args: (_t, q, x) => [x.proof ?? [], BigInt(q)],
    needs: "proof",
  },
  {
    label: "mint(uint256,bytes)",
    abi: parseAbi(["function mint(uint256 quantity, bytes signature) payable"]),
    fn: "mint",
    args: (_t, q, x) => [BigInt(q), x.signature ?? "0x"],
    needs: "signature",
  },
  // public / open mints
  {
    label: "mint(uint256)",
    abi: parseAbi(["function mint(uint256 quantity) payable"]),
    fn: "mint",
    args: (_t, q) => [BigInt(q)],
  },
  {
    label: "mint(address,uint256)",
    abi: parseAbi(["function mint(address to, uint256 quantity) payable"]),
    fn: "mint",
    args: (t, q) => [t, BigInt(q)],
  },
  {
    label: "publicMint(uint256)",
    abi: parseAbi(["function publicMint(uint256 quantity) payable"]),
    fn: "publicMint",
    args: (_t, q) => [BigInt(q)],
  },
  {
    label: "mintPublic(uint256)",
    abi: parseAbi(["function mintPublic(uint256 quantity) payable"]),
    fn: "mintPublic",
    args: (_t, q) => [BigInt(q)],
  },
  {
    label: "safeMint(address)",
    abi: parseAbi(["function safeMint(address to) payable"]),
    fn: "safeMint",
    args: (t) => [t],
  },
  {
    label: "mint()",
    abi: parseAbi(["function mint() payable"]),
    fn: "mint",
    args: () => [],
  },
];

export type MintNftResult = {
  txHash: `0x${string}`;
  signature: string;
  quantity: number;
  valueEth: string;
};

/** Probe which mint signature the contract actually accepts, without sending. */
export async function findMintCall(
  contract: Address,
  from: Address,
  quantity: number,
  value: bigint,
  extras: MintExtras = {},
): Promise<{ data: `0x${string}`; label: string }> {
  const hasProof = Array.isArray(extras.proof) && extras.proof.length > 0;
  const hasSig = typeof extras.signature === "string" && extras.signature.length > 2;

  const ordered = CANDIDATES.filter((c) => {
    if (c.needs === "proof") return hasProof;
    if (c.needs === "signature") return hasSig;
    return true;
  });

  const errors: string[] = [];
  for (const c of ordered) {
    try {
      const args = c.args(from, quantity, extras);
      await publicClient.estimateContractGas({
        address: contract,
        abi: c.abi,
        functionName: c.fn as any,
        args,
        account: from,
        value,
      });
      return {
        data: encodeFunctionData({ abi: c.abi, functionName: c.fn as any, args }),
        label: c.label,
      };
    } catch (e: any) {
      errors.push(`${c.label}: ${(e?.shortMessage ?? e?.message ?? "revert").slice(0, 70)}`);
    }
  }
  throw new Error("No mint function succeeded. Tried:\n" + errors.join("\n"));
}

/**
 * Mint from an NFT contract. Auto-detects the signature and supports
 * allowlist proofs / backend signatures.
 */
export async function mintNft(
  userId: number,
  contract: Address,
  quantity = 1,
  priceEth = "0",
  extras: MintExtras = {},
): Promise<MintNftResult> {
  const { kernelClient, smartAddress } = await getKernelClient(userId);
  const value = parseEther(priceEth) * BigInt(quantity);

  const call = await findMintCall(contract, smartAddress, quantity, value, extras);

  const hash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      { to: contract, value, data: call.data },
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

  return { txHash, signature: call.label, quantity, valueEth: priceEth };
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
