/**
 * Hand-rolled average-linkage agglomerative clustering with cosine distance and a
 * distance-threshold stopping criterion, equivalent to sklearn's
 * AgglomerativeClustering(n_clusters=None, distance_threshold=X, linkage="average",
 * metric="cosine") as used by apps/backend/app/services/analyzer.py's _fit_clusterer.
 *
 * Conversations are short (tens of turns), so an O(n^3) naive implementation is fine.
 */
function cosineDistance(left: number[], right: number[]): number {
  let dot = 0;
  let leftNormSq = 0;
  let rightNormSq = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNormSq += left[i] * left[i];
    rightNormSq += right[i] * right[i];
  }
  const denominator = Math.sqrt(leftNormSq) * Math.sqrt(rightNormSq);
  if (denominator === 0) return 1.0;
  const similarity = dot / denominator;
  return 1.0 - similarity;
}

/**
 * Average-linkage agglomerative clustering stopping when the minimum remaining
 * inter-cluster distance exceeds `distanceThreshold`. Returns one integer cluster
 * label per input row, in input order.
 */
export function agglomerativeClusterLabels(embeddings: number[][], distanceThreshold: number): number[] {
  const n = embeddings.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  // clusters[i] = list of original point indices currently in cluster i (by cluster key).
  const clusterMembers = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) clusterMembers.set(i, [i]);

  // distance[a][b] between active cluster keys a, b (a < b), maintained via Lance-Williams
  // average-linkage update after each merge.
  let distance = new Map<number, Map<number, number>>();
  const activeKeys: number[] = [];
  for (let i = 0; i < n; i += 1) activeKeys.push(i);

  const setDistance = (a: number, b: number, value: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    if (!distance.has(lo)) distance.set(lo, new Map());
    distance.get(lo)!.set(hi, value);
  };
  const getDistance = (a: number, b: number): number => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return distance.get(lo)?.get(hi) ?? Infinity;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      setDistance(i, j, cosineDistance(embeddings[i], embeddings[j]));
    }
  }

  let nextClusterId = n;

  while (activeKeys.length > 1) {
    let bestA = -1;
    let bestB = -1;
    let bestDistance = Infinity;
    for (let ai = 0; ai < activeKeys.length; ai += 1) {
      for (let bi = ai + 1; bi < activeKeys.length; bi += 1) {
        const a = activeKeys[ai];
        const b = activeKeys[bi];
        const d = getDistance(a, b);
        if (d < bestDistance) {
          bestDistance = d;
          bestA = a;
          bestB = b;
        }
      }
    }

    if (bestDistance > distanceThreshold) break;

    // Merge bestA and bestB into a new cluster.
    const membersA = clusterMembers.get(bestA)!;
    const membersB = clusterMembers.get(bestB)!;
    const sizeA = membersA.length;
    const sizeB = membersB.length;
    const newId = nextClusterId;
    nextClusterId += 1;
    clusterMembers.set(newId, [...membersA, ...membersB]);
    clusterMembers.delete(bestA);
    clusterMembers.delete(bestB);

    const remaining = activeKeys.filter((key) => key !== bestA && key !== bestB);
    for (const other of remaining) {
      // Lance-Williams average-linkage update:
      // d(new, other) = (sizeA / (sizeA+sizeB)) * d(a, other) + (sizeB / (sizeA+sizeB)) * d(b, other)
      const dAOther = getDistance(bestA, other);
      const dBOther = getDistance(bestB, other);
      const newDistance = (sizeA / (sizeA + sizeB)) * dAOther + (sizeB / (sizeA + sizeB)) * dBOther;
      setDistance(newId, other, newDistance);
    }

    remaining.push(newId);
    activeKeys.length = 0;
    activeKeys.push(...remaining);
  }

  const labels = new Array<number>(n).fill(0);
  let label = 0;
  for (const key of activeKeys) {
    for (const memberIndex of clusterMembers.get(key)!) {
      labels[memberIndex] = label;
    }
    label += 1;
  }
  return labels;
}
