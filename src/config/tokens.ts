export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
}

const TOKEN_MAP = {
  WETH: {
    symbol: "WETH",
    address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    decimals: 18,
  },
  ARB: {
    symbol: "ARB",
    address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    decimals: 18,
  },
  LINK: {
    symbol: "LINK",
    address: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
    decimals: 18,
  },
  UNI: {
    symbol: "UNI",
    address: "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0",
    decimals: 18,
  },
  WBTC: {
    symbol: "WBTC",
    address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    decimals: 8,
  },
  USDC: {
    symbol: "USDC",
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
  },
  USDC_E: {
    symbol: "USDC.e",
    address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    decimals: 6,
  },
  GMX: {
    symbol: "GMX",
    address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
    decimals: 18,
  },
  DAI: {
    symbol: "DAI",
    address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    decimals: 18,
  },
  USDT: {
    symbol: "USDT",
    address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    decimals: 6,
  },
  PENDLE: {
    symbol: "PENDLE",
    address: "0x0c880f6761f1aF8D9AA9c466984b80daB9C8aD2C",
    decimals: 18,
  },
  MAGIC: {
    symbol: "MAGIC",
    address: "0x539bdE0d7Dbd336b79148AA812963c660F9847aa",
    decimals: 18,
  },
} as const satisfies Record<string, TokenConfig>;

export type TokenSymbol = keyof typeof TOKEN_MAP;

export const TOKENS: Record<TokenSymbol, TokenConfig> = TOKEN_MAP;

/** Tokens scanned for cross-DEX arbitrage (excludes quote currency USDC) */
export const ARBITRAGE_SYMBOLS: TokenSymbol[] = [
  "WETH",
  "ARB",
  "LINK",
  "UNI",
  "WBTC",
  "USDC_E",
  "GMX",
  "DAI",
  "USDT",
  "PENDLE",
  "MAGIC",
] as const;
