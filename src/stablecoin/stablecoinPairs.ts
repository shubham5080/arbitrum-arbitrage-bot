import { StablecoinSymbol } from "./stablecoinConfig";

export interface StablecoinPair {
  id: string;
  base: StablecoinSymbol;
  quote: StablecoinSymbol;
  label: string;
}

/** Pairs monitored for peg deviation (Task 3) */
export const MONITORED_PAIRS: StablecoinPair[] = [
  { id: "USDC_USDC_E", base: "USDC", quote: "USDC_E", label: "USDC ↔ USDC.e" },
  { id: "USDC_USDT", base: "USDC", quote: "USDT", label: "USDC ↔ USDT" },
  { id: "USDC_DAI", base: "USDC", quote: "DAI", label: "USDC ↔ DAI" },
  { id: "USDT_DAI", base: "USDT", quote: "DAI", label: "USDT ↔ DAI" },
];

/** Extended pairs for discovery and Curve comparison */
export const EXTENDED_PAIRS: StablecoinPair[] = [
  ...MONITORED_PAIRS,
  { id: "USDC_FRAX", base: "USDC", quote: "FRAX", label: "USDC ↔ FRAX" },
  { id: "USDT_FRAX", base: "USDT", quote: "FRAX", label: "USDT ↔ FRAX" },
  { id: "DAI_FRAX", base: "DAI", quote: "FRAX", label: "DAI ↔ FRAX" },
];

export function pairKey(base: string, quote: string): string {
  return `${base}/${quote}`;
}
