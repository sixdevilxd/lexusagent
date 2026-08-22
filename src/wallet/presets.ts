import type { Address } from "viem";

export type DexPreset = {
  router: Address; // Uniswap V3 SwapRouter02
  quoter: Address; // Uniswap V3 QuoterV2
  weth: Address; // wrapped native token
  factory: Address; // Uniswap V3 Factory
  positionManager: Address; // NonfungiblePositionManager
};

// Official Uniswap V3 deployments
// https://developers.uniswap.org/docs/protocols/v3/deployments
const UNI_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as Address;
const UNI_QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as Address;
const UNI_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984" as Address;
const UNI_NPM = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" as Address;
const OP_STACK_WETH = "0x4200000000000000000000000000000000000006" as Address;

export const DEX_PRESETS: Record<number, DexPreset> = {
  // Ethereum
  1: {
    router: UNI_ROUTER,
    quoter: UNI_QUOTER,
    factory: UNI_FACTORY,
    positionManager: UNI_NPM,
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  // Optimism
  10: {
    router: UNI_ROUTER,
    quoter: UNI_QUOTER,
    factory: UNI_FACTORY,
    positionManager: UNI_NPM,
    weth: OP_STACK_WETH,
  },
  // Polygon (WMATIC)
  137: {
    router: UNI_ROUTER,
    quoter: UNI_QUOTER,
    factory: UNI_FACTORY,
    positionManager: UNI_NPM,
    weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  },
  // Arbitrum One
  42161: {
    router: UNI_ROUTER,
    quoter: UNI_QUOTER,
    factory: UNI_FACTORY,
    positionManager: UNI_NPM,
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  // Base
  8453: {
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    weth: OP_STACK_WETH,
  },
  // Base Sepolia
  84532: {
    router: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
    quoter: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
    factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    positionManager: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
    weth: OP_STACK_WETH,
  },
};
