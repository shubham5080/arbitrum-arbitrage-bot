/** Arbitrum token & DEX universe for alpha discovery research. */

export interface ResearchToken {
  symbol: string;
  address: string;
  decimals: number;
  category: "major" | "defi" | "ecosystem" | "stable" | "btc";
  /** Estimated 24h DEX volume tier for ranking when on-chain volume unavailable */
  volumeTier: 1 | 2 | 3 | 4 | 5;
}

export interface ResearchDex {
  id: string;
  name: string;
  type: "v3" | "v2" | "stable" | "weighted" | "hybrid";
  factory?: string;
  quoter?: string;
  /** DefiLlama approximate 30d volume on Arbitrum (USD) — research estimates */
  volume30dUsd: number;
  /** Approximate TVL on Arbitrum (USD) */
  tvlUsd: number;
  quoteAccessibility: "high" | "medium" | "low";
  integrationComplexity: "low" | "medium" | "high";
  scanned: boolean;
  notes: string;
}

export const SCANNED_TOKEN_SYMBOLS = ["WETH", "ARB", "LINK", "UNI", "WBTC", "USDC"] as const;

export const CANDIDATE_TOKENS: ResearchToken[] = [
  // Currently scanned
  { symbol: "WETH", address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", decimals: 18, category: "major", volumeTier: 5 },
  { symbol: "ARB", address: "0x912ce59144191c1204e64559fe8253a0e49e6548", decimals: 18, category: "ecosystem", volumeTier: 5 },
  { symbol: "LINK", address: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", decimals: 18, category: "major", volumeTier: 4 },
  { symbol: "UNI", address: "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0", decimals: 18, category: "defi", volumeTier: 3 },
  { symbol: "WBTC", address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", decimals: 8, category: "btc", volumeTier: 4 },
  { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, category: "stable", volumeTier: 5 },
  // Expansion candidates
  { symbol: "GMX", address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", decimals: 18, category: "ecosystem", volumeTier: 4 },
  { symbol: "RDNT", address: "0x3082CC23568eA640225c2467653DbEe52bC1fEEd", decimals: 18, category: "ecosystem", volumeTier: 3 },
  { symbol: "MAGIC", address: "0x539bdE0d7Dbd336b79148AA812963c660F9847aa", decimals: 18, category: "ecosystem", volumeTier: 3 },
  { symbol: "PENDLE", address: "0x0c880f6761F1af8d9Aa9C466984B80DAb9c8Ad2c", decimals: 18, category: "defi", volumeTier: 4 },
  { symbol: "GNS", address: "0x18c11FD286C5EC11c3bEDCCE833C9483d8400D33", decimals: 18, category: "ecosystem", volumeTier: 2 },
  { symbol: "AAVE", address: "0xba5DdD1f9d7F54880b9b5bA9b112d02d8A56bf03", decimals: 18, category: "defi", volumeTier: 3 },
  { symbol: "CRV", address: "0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978", decimals: 18, category: "defi", volumeTier: 3 },
  { symbol: "LDO", address: "0x13AD51ed4F1B7e9DC168d8a00cB3fa4B367702e", decimals: 18, category: "defi", volumeTier: 3 },
  { symbol: "FRAX", address: "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F", decimals: 18, category: "stable", volumeTier: 2 },
  { symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, category: "stable", volumeTier: 4 },
  { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b769FCd9", decimals: 6, category: "stable", volumeTier: 5 },
  { symbol: "USDC.e", address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6, category: "stable", volumeTier: 3 },
  { symbol: "GRAIL", address: "0x3d9907F9a368ad0a738BE4aEB792B99870BC852E", decimals: 18, category: "ecosystem", volumeTier: 2 },
  { symbol: "DPX", address: "0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55", decimals: 18, category: "ecosystem", volumeTier: 2 },
  { symbol: "STG", address: "0x6694340fc020c5E6B965678416da55f7f49Ab3B0", decimals: 18, category: "defi", volumeTier: 2 },
  { symbol: "FXS", address: "0x9d2F71550D8fCDA7B195902Efca5497f2c951774", decimals: 18, category: "defi", volumeTier: 2 },
];

export const CANDIDATE_DEXES: ResearchDex[] = [
  {
    id: "UNISWAP",
    name: "Uniswap V3",
    type: "v3",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    volume30dUsd: 4_700_000_000,
    tvlUsd: 370_000_000,
    quoteAccessibility: "high",
    integrationComplexity: "low",
    scanned: true,
    notes: "Dominant Arbitrum DEX (~70% volume). Already integrated.",
  },
  {
    id: "SUSHI",
    name: "SushiSwap V3",
    type: "v3",
    factory: "0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    volume30dUsd: 21_000_000,
    tvlUsd: 15_000_000,
    quoteAccessibility: "high",
    integrationComplexity: "low",
    scanned: true,
    notes: "Low volume vs Uniswap. Quote engine repaired Day 27.",
  },
  {
    id: "CAMELOT",
    name: "Camelot",
    type: "hybrid",
    factory: "0x6EcCab422D763aC031210895C81787E87B43A652",
    quoter: "0xFe24b2cDfF01B644995bc248bA8497467d688F7B",
    volume30dUsd: 270_000_000,
    tvlUsd: 80_000_000,
    quoteAccessibility: "medium",
    integrationComplexity: "medium",
    scanned: true,
    notes: "Native Arbitrum DEX. Slot0 pricing — less accurate than quoter.",
  },
  {
    id: "PANCAKESWAP",
    name: "PancakeSwap V3",
    type: "v3",
    factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    quoter: "0xB048Bbc1Ee6b733FFfCFb9E9CeF7375518e25997",
    volume30dUsd: 300_000_000,
    tvlUsd: 45_000_000,
    quoteAccessibility: "high",
    integrationComplexity: "low",
    scanned: false,
    notes: "3rd largest by volume on Arbitrum. Same V3 quoter pattern as Uniswap.",
  },
  {
    id: "CURVE",
    name: "Curve Finance",
    type: "stable",
    volume30dUsd: 57_000_000,
    tvlUsd: 120_000_000,
    quoteAccessibility: "medium",
    integrationComplexity: "high",
    scanned: false,
    notes: "Best for stablecoin peg arb. Pool-specific registry, not factory-based.",
  },
  {
    id: "BALANCER",
    name: "Balancer V2",
    type: "weighted",
    factory: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    volume30dUsd: 41_000_000,
    tvlUsd: 60_000_000,
    quoteAccessibility: "medium",
    integrationComplexity: "high",
    scanned: false,
    notes: "Vault + poolId model. Weighted/multi-asset pools.",
  },
  {
    id: "FLUID",
    name: "Fluid",
    type: "hybrid",
    volume30dUsd: 360_000_000,
    tvlUsd: 50_000_000,
    quoteAccessibility: "low",
    integrationComplexity: "high",
    scanned: false,
    notes: "Rising volume share. Proprietary routing — hard to quote offline.",
  },
  {
    id: "RAMSES",
    name: "Ramses",
    type: "v2",
    volume30dUsd: 900_000,
    tvlUsd: 5_000_000,
    quoteAccessibility: "medium",
    integrationComplexity: "medium",
    scanned: false,
    notes: "Solidly-style ve(3,3). Low volume but native ARB ecosystem pairs.",
  },
  {
    id: "TRADER_JOE",
    name: "Trader Joe V2.1",
    type: "hybrid",
    volume30dUsd: 1_200_000,
    tvlUsd: 3_000_000,
    quoteAccessibility: "medium",
    integrationComplexity: "medium",
    scanned: false,
    notes: "Limited Arbitrum presence vs Avalanche.",
  },
  {
    id: "CHRONOS",
    name: "Chronos",
    type: "v2",
    volume30dUsd: 200_000,
    tvlUsd: 1_000_000,
    quoteAccessibility: "low",
    integrationComplexity: "medium",
    scanned: false,
    notes: "Minimal volume. Low priority.",
  },
];
