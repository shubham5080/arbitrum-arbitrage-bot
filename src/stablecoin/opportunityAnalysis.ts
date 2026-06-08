import {
  classifyDeviationBps,
  DeviationBucket,
  getDeviationFrequency,
  getDurationStats,
  getPegSnapshotsSince,
  StoredPegSnapshot,
} from "./stablecoinDatabase";

export interface DeviationAnalysis {
  totalSnapshots: number;
  frequency: Record<DeviationBucket, number>;
  frequencyPct: Record<DeviationBucket, number>;
  maxDeviationBps: number;
  avgAbsDeviationBps: number;
  pairBreakdown: Record<string, { count: number; maxBps: number; avgAbsBps: number }>;
  durationStats: ReturnType<typeof getDurationStats>;
}

export function analyzeDeviations(secondsAgo?: number): DeviationAnalysis {
  const snapshots: StoredPegSnapshot[] =
    secondsAgo !== undefined
      ? getPegSnapshotsSince(secondsAgo)
      : getPegSnapshotsSince(365 * 24 * 3600);

  const frequency = getDeviationFrequency(secondsAgo);
  const total = snapshots.length || 1;

  const frequencyPct: Record<DeviationBucket, number> = {
    "0-1": (frequency["0-1"] / total) * 100,
    "1-5": (frequency["1-5"] / total) * 100,
    "5-10": (frequency["5-10"] / total) * 100,
    "10+": (frequency["10+"] / total) * 100,
  };

  let maxDeviationBps = 0;
  let sumAbs = 0;
  const pairBreakdown: DeviationAnalysis["pairBreakdown"] = {};

  for (const s of snapshots) {
    const abs = Math.abs(s.deviation_bps);
    maxDeviationBps = Math.max(maxDeviationBps, abs);
    sumAbs += abs;

    if (!pairBreakdown[s.pair]) {
      pairBreakdown[s.pair] = { count: 0, maxBps: 0, avgAbsBps: 0 };
    }
    const pb = pairBreakdown[s.pair]!;
    pb.count += 1;
    pb.maxBps = Math.max(pb.maxBps, abs);
    pb.avgAbsBps += abs;
  }

  for (const pair of Object.keys(pairBreakdown)) {
    const pb = pairBreakdown[pair]!;
    pb.avgAbsBps = pb.count > 0 ? pb.avgAbsBps / pb.count : 0;
  }

  return {
    totalSnapshots: snapshots.length,
    frequency,
    frequencyPct,
    maxDeviationBps,
    avgAbsDeviationBps: snapshots.length > 0 ? sumAbs / snapshots.length : 0,
    pairBreakdown,
    durationStats: getDurationStats(),
  };
}

export function formatDeviationAnalysisMarkdown(analysis: DeviationAnalysis): string {
  const lines = [
    "## Deviation Frequency",
    "",
    `Total snapshots: **${analysis.totalSnapshots}**`,
    "",
    "| Bucket (bps) | Count | % of Total |",
    "|--------------|-------|------------|",
  ];

  for (const bucket of ["0-1", "1-5", "5-10", "10+"] as DeviationBucket[]) {
    lines.push(
      `| ${bucket} | ${analysis.frequency[bucket]} | ${analysis.frequencyPct[bucket].toFixed(1)}% |`
    );
  }

  lines.push(
    "",
    `**Max deviation:** ${analysis.maxDeviationBps.toFixed(2)} bps`,
    `**Avg |deviation|:** ${analysis.avgAbsDeviationBps.toFixed(2)} bps`,
    "",
    "### Per-Pair Breakdown",
    "",
    "| Pair | Snapshots | Max (bps) | Avg |dev| (bps) |",
    "|------|-----------|-----------|----------------|"
  );

  for (const [pair, stats] of Object.entries(analysis.pairBreakdown)) {
    lines.push(
      `| ${pair} | ${stats.count} | ${stats.maxBps.toFixed(2)} | ${stats.avgAbsBps.toFixed(2)} |`
    );
  }

  return lines.join("\n");
}

export function formatDurationAnalysisMarkdown(
  durationStats: ReturnType<typeof getDurationStats>
): string {
  return [
    "## Duration Analysis",
    "",
    `Completed deviation episodes: **${durationStats.count}**`,
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Avg duration | ${durationStats.avgDurationSec}s |`,
    `| Median duration | ${durationStats.medianDurationSec}s |`,
    `| Max duration | ${durationStats.maxDurationSec}s |`,
  ].join("\n");
}
