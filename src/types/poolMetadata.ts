export type PoolType = "V2" | "V3";

export interface PoolMetadata {
  poolAddress: string;
  dex: string;
  poolType: PoolType;
  feeTier: number;
  token0: string;
  token1: string;
  liquidity: bigint;
}

export class PoolMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoolMetadataError";
  }
}

export function assertPoolMetadata(pool: PoolMetadata): void {
  if (!pool.poolType) {
    throw new PoolMetadataError("poolType is required");
  }
  if (!pool.poolAddress) {
    throw new PoolMetadataError("poolAddress is required");
  }
  if (!pool.token0) {
    throw new PoolMetadataError("token0 is required");
  }
  if (!pool.token1) {
    throw new PoolMetadataError("token1 is required");
  }
  if (pool.poolType === "V3" && (pool.feeTier === undefined || pool.feeTier === null)) {
    throw new PoolMetadataError("feeTier is required for V3 pools");
  }
}

/** @deprecated Use poolAddress — kept for gradual migration */
export function poolAddress(pool: PoolMetadata): string {
  return pool.poolAddress;
}

/** @deprecated Use feeTier — kept for gradual migration */
export function poolFee(pool: PoolMetadata): number {
  return pool.feeTier;
}
