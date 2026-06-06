import { TriangleRoute } from "./types";
import { TOKENS } from "../../config/tokens";
import { ADDRESSES } from "../../config/addresses";

export function generateRoutes(): TriangleRoute[] {
  const mids = ["ARB", "LINK", "UNI", "WBTC"];

  return mids.map((sym) => {
    const token = (TOKENS as any)[sym];
    return {
      startToken: ADDRESSES.USDC,
      middleToken: token.address,
      endToken: TOKENS.WETH.address,
      startTokenDecimals: 6,
      middleTokenDecimals: token.decimals,
      endTokenDecimals: TOKENS.WETH.decimals,
    } as TriangleRoute;
  });
}

export function routeName(route: TriangleRoute): string {
  return `${route.startToken}->${route.middleToken}->${route.endToken}->USDC`;
}
