import { ExecutionPlanResult, TradeSizeEstimate } from "../execution/executionTypes";

export interface ExecutionDashboardSummary {
  totalPlans: number;
  executableOpportunities: number;
  bestExecutable?: ExecutionPlanResult | undefined;
  highestProfitOpportunity?: ExecutionPlanResult | undefined;
  safestOpportunity?: ExecutionPlanResult | undefined;
  topRecommendedSizes: TradeSizeEstimate[];
}

export function buildExecutionDashboard(plans: ExecutionPlanResult[]): ExecutionDashboardSummary {
  const executablePlans = plans.filter((plan) => plan.executable);
  const bestExecutable = executablePlans.sort((a, b) => b.expectedNetProfit - a.expectedNetProfit)[0];
  const highestProfitOpportunity = plans.sort((a, b) => b.expectedNetProfit - a.expectedNetProfit)[0];
  const safestOpportunity = plans
    .slice()
    .sort((a, b) => {
      const scoreOrder = riskOrder(a.riskScore) - riskOrder(b.riskScore);
      if (scoreOrder !== 0) return scoreOrder;
      return b.expectedNetProfit - a.expectedNetProfit;
    })[0];

  const topRecommendedSizes = plans
    .flatMap((plan) => plan.sizeEstimates ?? [])
    .sort((a, b) => b.finalProfit - a.finalProfit)
    .slice(0, 5);

  return {
    totalPlans: plans.length,
    executableOpportunities: executablePlans.length,
    bestExecutable,
    highestProfitOpportunity,
    safestOpportunity,
    topRecommendedSizes,
  };
}

export function printExecutionDashboard(summary: ExecutionDashboardSummary) {
  console.log("\n=== Execution Planning Dashboard ===\n");
  console.log(`Total opportunities examined: ${summary.totalPlans}`);
  console.log(`Executable opportunities: ${summary.executableOpportunities}`);

  if (summary.bestExecutable) {
    console.log("\nBest executable opportunity:");
    console.log(`  Token: ${summary.bestExecutable.token}`);
    console.log(`  Route: ${summary.bestExecutable.route}`);
    console.log(`  Trade size: $${summary.bestExecutable.tradeSize}`);
    console.log(`  Expected net profit: $${summary.bestExecutable.expectedNetProfit.toFixed(2)}`);
    console.log(`  Risk score: ${summary.bestExecutable.riskScore}`);
  }

  if (summary.highestProfitOpportunity) {
    console.log("\nHighest profit opportunity:");
    console.log(`  Token: ${summary.highestProfitOpportunity.token}`);
    console.log(`  Route: ${summary.highestProfitOpportunity.route}`);
    console.log(`  Expected net profit: $${summary.highestProfitOpportunity.expectedNetProfit.toFixed(2)}`);
  }

  if (summary.safestOpportunity) {
    console.log("\nSafest opportunity:");
    console.log(`  Token: ${summary.safestOpportunity.token}`);
    console.log(`  Route: ${summary.safestOpportunity.route}`);
    console.log(`  Expected net profit: $${summary.safestOpportunity.expectedNetProfit.toFixed(2)}`);
    console.log(`  Risk score: ${summary.safestOpportunity.riskScore}`);
  }

  if (summary.topRecommendedSizes.length > 0) {
    console.log("\nTop recommended trade sizes:");
    summary.topRecommendedSizes.forEach((item, index) => {
      console.log(
        `  ${index + 1}. Size $${item.size} - Final profit $${item.finalProfit.toFixed(2)} - Executable: ${item.executable}`
      );
    });
  }

  console.log("\n===================================\n");
}

function riskOrder(score: string) {
  if (score === "LOW") return 0;
  if (score === "MEDIUM") return 1;
  return 2;
}
