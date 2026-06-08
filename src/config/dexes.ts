import { ADDRESSES } from "./addresses";

export const DEXES = {
  UNISWAP: "UNISWAP",
  SUSHI: "SUSHI",
  CAMELOT: "CAMELOT",
  PANCAKESWAP: "PANCAKESWAP",
} as const;

export type DexId = (typeof DEXES)[keyof typeof DEXES];

export interface DexEndpoints {
  factory?: string;
  quoter?: string;
  router?: string;
}

/** Centralized DEX contract configuration */
export const DEX_CONFIG: Record<DexId, DexEndpoints> = {
  [DEXES.UNISWAP]: {
    factory: ADDRESSES.UNISWAP_V3_FACTORY,
    quoter: ADDRESSES.UNISWAP_V3_QUOTER,
    router: ADDRESSES.UNISWAP_V3_ROUTER,
  },
  [DEXES.SUSHI]: {
    factory: ADDRESSES.SUSHI_V3_FACTORY,
    quoter: ADDRESSES.UNISWAP_V3_QUOTER,
    router: ADDRESSES.UNISWAP_V3_ROUTER,
  },
  [DEXES.CAMELOT]: {
    factory: ADDRESSES.CAMELOT_AMMV2_FACTORY,
    quoter: ADDRESSES.CAMELOT_QUOTER,
    router: ADDRESSES.CAMELOT_SWAP_ROUTER,
  },
  [DEXES.PANCAKESWAP]: {
    factory: ADDRESSES.PANCAKESWAP_V3_FACTORY,
    quoter: ADDRESSES.PANCAKESWAP_V3_QUOTER,
    router: ADDRESSES.PANCAKESWAP_V3_ROUTER,
  },
};

export const SCAN_DEXES: DexId[] = [
  DEXES.UNISWAP,
  DEXES.SUSHI,
  DEXES.CAMELOT,
  DEXES.PANCAKESWAP,
];
