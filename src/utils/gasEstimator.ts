import { ethers } from "ethers";

export async function estimateGasCost(
  provider: ethers.Provider
) {
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 0n;
  const gasUsed = 800000n;
  const gasCostWei = gasPrice * gasUsed;
  return Number(ethers.formatEther(gasCostWei));
}
