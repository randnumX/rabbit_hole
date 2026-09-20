/**
 * Replaces ruptures.Pelt usage in apps/backend/app/services/analyzer.py's
 * `_detect_change_points`. That function tries a PELT/RBF changepoint detector and
 * falls back to a quantile-threshold heuristic if ruptures is unavailable. There is
 * no viable JS equivalent to PELT/RBF, so this port implements only the fallback
 * heuristic directly -- it's already a supported degraded path in the Python code,
 * and only feeds a minor drift-score bonus + an explanation footnote, not the core
 * classification cascade.
 */

// Matches numpy's default linear-interpolation quantile behavior.
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = q * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const fraction = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * fraction;
}

/**
 * Mirrors the Python fallback: given sequential turn-to-turn distances, returns the
 * set of turn indices (1-based within the distances array, i.e. index+1) whose
 * distance is at or above the 80th percentile of all distances.
 */
export function detectChangePoints(distances: number[]): Set<number> {
  if (distances.length < 3) return new Set();

  const sorted = [...distances].sort((a, b) => a - b);
  const threshold = quantile(sorted, 0.8);

  const changePoints = new Set<number>();
  distances.forEach((distance, index) => {
    if (distance >= threshold) changePoints.add(index + 1);
  });
  return changePoints;
}
