import { encodeFunctionData, parseUnits } from "viem";

/**
 * Default generic token-factory / launchpad ABI.
 * >>> EDIT THIS to match your target launchpad's create function. <<<
 * Many launchpads expose something like:
 *   createToken(string name, string symbol, uint256 totalSupply, string logoURI)
 */
export const factoryAbi = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "totalSupply", type: "uint256" },
      { name: "logoURI", type: "string" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
] as const;

export type MintParams = {
  name: string;
  symbol: string;
  supply: string; // human units, e.g. "1000000"
  decimals?: number;
  logo?: string;
  valueEth?: string; // optional creation fee override
};

/** Encode the create-token calldata for the configured factory. */
export function encodeMint(p: MintParams): `0x${string}` {
  const decimals = p.decimals ?? 18;
  return encodeFunctionData({
    abi: factoryAbi,
    functionName: "createToken",
    args: [p.name, p.symbol, parseUnits(p.supply, decimals), p.logo ?? ""],
  });
}
