import { OpportunitiesStats, getStats1Hour } from "./stats";

export function formatStats(stats: OpportunitiesStats): string {
  const line = "=".repeat(50);

  let output = `\n${line}\n`;
  output += `ARBITRAGE OPPORTUNITY REPORT\n`;
  output += `${line}\n\n`;

  // Main metrics
  output += `Scans: ${stats.totalScans}\n`;
  output += `Profitable: ${stats.profitableCount}/${stats.totalScans} (${stats.profitablePercentage}%)\n\n`;

  // Profit metrics
  output += `Max Profit: $${stats.maxProfit.toFixed(2)} USDC\n`;
  output += `Avg Profit: $${stats.averageProfit.toFixed(2)} USDC\n`;
  output += `Min Profit: $${stats.minProfit.toFixed(2)} USDC\n\n`;

  // Best opportunities
  output += `Best Token: ${stats.bestToken}\n`;
  output += `Best Route: ${stats.bestRoute}\n`;
  output += `Worst Route: ${stats.worstRoute}\n\n`;

  // Top tokens
  if (stats.topTokens.length > 0) {
    output += `Top Tokens:\n`;
    stats.topTokens.forEach((token, idx) => {
      output += `  ${idx + 1}. ${token.token}: $${token.profit.toFixed(2)} USDC (${token.count} scans)\n`;
    });
    output += "\n";
  }

  // Top routes
  if (stats.topRoutes.length > 0) {
    output += `Top Routes:\n`;
    stats.topRoutes.forEach((route, idx) => {
      output += `  ${idx + 1}. ${route.route}: $${route.profit.toFixed(2)} USDC (${route.count} scans)\n`;
    });
    output += "\n";
  }

  // Top DEXes
  if (stats.topDexes.length > 0) {
    output += `Top DEXes:\n`;
    stats.topDexes.forEach((dex, idx) => {
      output += `  ${idx + 1}. ${dex.dex}: $${dex.profit.toFixed(2)} USDC (${dex.count} scans)\n`;
    });
    output += "\n";
  }

  // Size analysis
  if (stats.sizeAnalysis.length > 0 && stats.sizeAnalysis.length <= 9) {
    output += `Trade Size Performance:\n`;
    stats.sizeAnalysis.forEach((size) => {
      const profitRate = ((size.profitableCount / size.count) * 100).toFixed(1);
      output += `  Size $${size.size}: Avg $${size.avgProfit.toFixed(2)}/scan (${profitRate}% profitable, ${size.count} scans)\n`;
    });
    output += "\n";
  }

  output += `${line}\n`;

  return output;
}

export function printHourlyDashboard() {
  const stats = getStats1Hour();
  const report = formatStats(stats);
  console.log(report);
}

export default {
  formatStats,
  printHourlyDashboard,
};
