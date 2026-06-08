export interface StablecoinConfig {
  symbol: string;
  address: string;
  decimals: number;
  /** Peg target in USD (1.0 for fiat-backed stables) */
  pegTarget: number;
}

export const STABLECOINS = {
  USDC: {
    symbol: "USDC",
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    pegTarget: 1.0,
  },
  USDC_E: {
    symbol: "USDC.e",
    address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    decimals: 6,
    pegTarget: 1.0,
  },
  USDT: {
    symbol: "USDT",
    address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    decimals: 6,
    pegTarget: 1.0,
  },
  DAI: {
    symbol: "DAI",
    address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    decimals: 18,
    pegTarget: 1.0,
  },
  FRAX: {
    symbol: "FRAX",
    address: "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F",
    decimals: 18,
    pegTarget: 1.0,
  },
} as const satisfies Record<string, StablecoinConfig>;

export type StablecoinSymbol = keyof typeof STABLECOINS;

export const STABLECOIN_SYMBOLS: StablecoinSymbol[] = [
  "USDC",
  "USDC_E",
  "USDT",
  "DAI",
  "FRAX",
];

export function getStablecoin(symbol: string): StablecoinConfig | undefined {
  const key = symbol === "USDC.e" ? "USDC_E" : symbol;
  return STABLECOINS[key as StablecoinSymbol];
}

export function getStablecoinByAddress(address: string): StablecoinConfig | undefined {
  const lower = address.toLowerCase();
  return STABLECOIN_SYMBOLS.map((s) => STABLECOINS[s]).find(
    (c) => c.address.toLowerCase() === lower
  );
}
