export const DEX_ROUTERS = {
  arbitrumOne: {
    UNISWAP: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    SUSHI: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    CAMELOT: "0x4ee15342d6Deb297c3A2aA7CFFd451f788675F53",
  },
  arbitrumSepolia: {
    // Uniswap V3 SwapRouter; Sushi/Camelot are not on Sepolia — use Uniswap for both legs
    UNISWAP: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    SUSHI: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    CAMELOT: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  },
} as const;

export const SEPOLIA_TOKENS = {
  USDC: "0x75faf514d9d7f7b38e0aad4d18adf84b7a431d26",
  WETH: "0xe591bf4296bf6e4ec5dad3b59a3370207feb0ea9",
} as const;

export const UNISWAP_FEE_TIERS = {
  LOW: 500,
  MEDIUM: 3000,
  HIGH: 10000,
} as const;

export function resolveDexRouter(
  dexName: string,
  network: "arbitrumOne" | "arbitrumSepolia" = "arbitrumOne"
): string {
  const routers = DEX_ROUTERS[network];
  const key = dexName.toUpperCase() as keyof typeof routers;
  if (!(key in routers)) {
    throw new Error(`Unknown DEX: ${dexName}`);
  }
  return routers[key];
}
