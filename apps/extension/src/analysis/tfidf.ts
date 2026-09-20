/**
 * Minimal TF-IDF replacing sklearn.feature_extraction.text.TfidfVectorizer usage in
 * apps/backend/app/services/analyzer.py's `_top_terms_for_texts` (unigrams+bigrams,
 * English stopwords, max_features=250) and the stopword list used by
 * HashingVectorizer in embeddings.py's fallback provider.
 *
 * Formula matches sklearn defaults: idf = ln((1+n)/(1+df)) + 1 (smooth_idf=True),
 * tf = raw term count, rows L2-normalized (norm='l2').
 */

// Exact list from sklearn.feature_extraction.text.ENGLISH_STOP_WORDS.
export const ENGLISH_STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'above', 'across', 'after', 'afterwards', 'again', 'against', 'all', 'almost',
  'alone', 'along', 'already', 'also', 'although', 'always', 'am', 'among', 'amongst', 'amoungst',
  'amount', 'an', 'and', 'another', 'any', 'anyhow', 'anyone', 'anything', 'anyway', 'anywhere',
  'are', 'around', 'as', 'at', 'back', 'be', 'became', 'because', 'become', 'becomes',
  'becoming', 'been', 'before', 'beforehand', 'behind', 'being', 'below', 'beside', 'besides', 'between',
  'beyond', 'bill', 'both', 'bottom', 'but', 'by', 'call', 'can', 'cannot', 'cant',
  'co', 'con', 'could', 'couldnt', 'cry', 'de', 'describe', 'detail', 'do', 'done',
  'down', 'due', 'during', 'each', 'eg', 'eight', 'either', 'eleven', 'else', 'elsewhere',
  'empty', 'enough', 'etc', 'even', 'ever', 'every', 'everyone', 'everything', 'everywhere', 'except',
  'few', 'fifteen', 'fifty', 'fill', 'find', 'fire', 'first', 'five', 'for', 'former',
  'formerly', 'forty', 'found', 'four', 'from', 'front', 'full', 'further', 'get', 'give',
  'go', 'had', 'has', 'hasnt', 'have', 'he', 'hence', 'her', 'here', 'hereafter',
  'hereby', 'herein', 'hereupon', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'however',
  'hundred', 'i', 'ie', 'if', 'in', 'inc', 'indeed', 'interest', 'into', 'is',
  'it', 'its', 'itself', 'keep', 'last', 'latter', 'latterly', 'least', 'less', 'ltd',
  'made', 'many', 'may', 'me', 'meanwhile', 'might', 'mill', 'mine', 'more', 'moreover',
  'most', 'mostly', 'move', 'much', 'must', 'my', 'myself', 'name', 'namely', 'neither',
  'never', 'nevertheless', 'next', 'nine', 'no', 'nobody', 'none', 'noone', 'nor', 'not',
  'nothing', 'now', 'nowhere', 'of', 'off', 'often', 'on', 'once', 'one', 'only',
  'onto', 'or', 'other', 'others', 'otherwise', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'part', 'per', 'perhaps', 'please', 'put', 'rather', 're', 'same', 'see',
  'seem', 'seemed', 'seeming', 'seems', 'serious', 'several', 'she', 'should', 'show', 'side',
  'since', 'sincere', 'six', 'sixty', 'so', 'some', 'somehow', 'someone', 'something', 'sometime',
  'sometimes', 'somewhere', 'still', 'such', 'system', 'take', 'ten', 'than', 'that', 'the',
  'their', 'them', 'themselves', 'then', 'thence', 'there', 'thereafter', 'thereby', 'therefore', 'therein',
  'thereupon', 'these', 'they', 'thick', 'thin', 'third', 'this', 'those', 'though', 'three',
  'through', 'throughout', 'thru', 'thus', 'to', 'together', 'too', 'top', 'toward', 'towards',
  'twelve', 'twenty', 'two', 'un', 'under', 'until', 'up', 'upon', 'us', 'very',
  'via', 'was', 'we', 'well', 'were', 'what', 'whatever', 'when', 'whence', 'whenever',
  'where', 'whereafter', 'whereas', 'whereby', 'wherein', 'whereupon', 'wherever', 'whether', 'which', 'while',
  'whither', 'who', 'whoever', 'whole', 'whom', 'whose', 'why', 'will', 'with', 'within',
  'without', 'would', 'yet', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

// sklearn's default TfidfVectorizer token pattern is r"(?u)\b\w\w+\b" (2+ word chars).
const TOKEN_PATTERN = /\b\w\w+\b/gu;

function tokenize(text: string): string[] {
  const raw = (text.toLowerCase().match(TOKEN_PATTERN) ?? []).filter((token) => !ENGLISH_STOP_WORDS.has(token));
  const tokens: string[] = [...raw];
  for (let i = 0; i < raw.length - 1; i += 1) {
    tokens.push(`${raw[i]} ${raw[i + 1]}`);
  }
  return tokens;
}

interface TfidfResult {
  featureNames: string[];
  /** rows[docIndex][featureIndex] = tf-idf weight, L2-normalized per row. */
  rows: Float64Array[];
}

const MAX_FEATURES = 250;

function fitTransform(texts: string[]): TfidfResult | null {
  const docTokenCounts: Map<string, number>[] = texts.map((text) => {
    const counts = new Map<string, number>();
    for (const token of tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return counts;
  });

  const documentFrequency = new Map<string, number>();
  for (const counts of docTokenCounts) {
    for (const token of counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  if (documentFrequency.size === 0) return null;

  // sklearn ranks vocabulary alphabetically before applying max_features (keeps the
  // highest document-frequency terms when the vocabulary exceeds the cap).
  let vocabulary = [...documentFrequency.keys()].sort();
  if (vocabulary.length > MAX_FEATURES) {
    vocabulary = [...vocabulary]
      .sort((a, b) => (documentFrequency.get(b)! - documentFrequency.get(a)!) || a.localeCompare(b))
      .slice(0, MAX_FEATURES)
      .sort();
  }

  const featureIndex = new Map(vocabulary.map((term, index) => [term, index]));
  const n = texts.length;
  const idf = vocabulary.map((term) => Math.log((1 + n) / (1 + documentFrequency.get(term)!)) + 1);

  const rows = docTokenCounts.map((counts) => {
    const row = new Float64Array(vocabulary.length);
    for (const [token, count] of counts) {
      const index = featureIndex.get(token);
      if (index === undefined) continue;
      row[index] = count * idf[index];
    }
    let normSq = 0;
    for (let i = 0; i < row.length; i += 1) normSq += row[i] * row[i];
    const norm = Math.sqrt(normSq);
    if (norm > 0) {
      for (let i = 0; i < row.length; i += 1) row[i] /= norm;
    }
    return row;
  });

  return { featureNames: vocabulary, rows };
}

/**
 * Mirrors analyzer.py's `_top_terms_for_texts`: fits TF-IDF over the given texts,
 * sums each feature's score across all rows, ranks descending, returns up to the top
 * 3 feature names (underscores -- there are none here since we don't stem/join with
 * "_", but kept for parity -- replaced with spaces) with positive summed score.
 */
export function topTermsForTexts(texts: string[]): string[] {
  const nonEmpty = texts.filter((text) => text.trim().length > 0);
  if (nonEmpty.length === 0) return ['Conversation topic'];

  const fitted = fitTransform(nonEmpty);
  if (!fitted || fitted.featureNames.length === 0) return ['Conversation topic'];

  const scores = new Float64Array(fitted.featureNames.length);
  for (const row of fitted.rows) {
    for (let i = 0; i < row.length; i += 1) scores[i] += row[i];
  }

  const ranked = [...scores.keys()].sort((a, b) => scores[b] - scores[a]);
  const labels = ranked
    .slice(0, 3)
    .filter((index) => scores[index] > 0)
    .map((index) => fitted.featureNames[index].replace(/_/g, ' '));

  return labels.length > 0 ? labels : ['Conversation topic'];
}

/** Mirrors analyzer.py's `_build_topic_labels`: one label per cluster id, top-2 terms joined by " / ". */
export function buildTopicLabels(texts: string[], clusterIds: number[]): Map<number, string> {
  const labels = new Map<number, string>();
  const uniqueIds = [...new Set(clusterIds)].sort((a, b) => a - b);
  for (const clusterId of uniqueIds) {
    const clusterTexts = texts.filter((_, index) => clusterIds[index] === clusterId);
    labels.set(clusterId, topTermsForTexts(clusterTexts).slice(0, 2).join(' / '));
  }
  return labels;
}

/** Mirrors analyzer.py's `_build_root_topic_label`. */
export function buildRootTopicLabel(rootTexts: string[]): string {
  return topTermsForTexts(rootTexts).slice(0, 2).join(' / ');
}
