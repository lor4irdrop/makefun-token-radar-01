// radar-3 model: category-calibrated implied launch value for tokenless protocols.
// Pure functions only. No clocks, no randomness, no unordered iteration:
// every collection that reaches the output is sorted explicitly first.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface CatMultiple {
  multiple: number;
  n: number;
}

export interface CatRaw {
  raw: number | null;
  winsor: number | null;
  n: number;
}

export interface ModelFacts {
  snapshotTime: Date;
  globalMultiple: number;
  p25: number;
  p75: number;
  multiples: Record<string, CatMultiple>;
  rawMedians: Record<string, CatRaw>;
  categoryGrowth: Record<string, number | null>;
  globalGrowth: number;
}

export interface FarmTemplate {
  product: string;
  first: string;
  second: string;
}

// ---- small numeric helpers -------------------------------------------------

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Exclusive PERCENTILE.EXC (type-6) percentile: index p * (n + 1) - 1,
// interpolated between the two nearest values and clamped to the range.
// The ordinary type-7 rule would drag p25/p75 inward toward the median,
// narrowing the winsor band and skewing every category multiple built on it.
export function percentileExc(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let idx = p * (n + 1) - 1;
  if (idx < 0) idx = 0;
  if (idx > n - 1) idx = n - 1;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- protocol classification -----------------------------------------------

// A protocol counts as tokened when DefiLlama records any token trace for it:
// a market cap, a ticker symbol, or a CoinGecko id.
export function hasToken(p: Proto): boolean {
  return p.mcap_usd !== null || p.symbol !== null || p.gecko_id !== null;
}

export function categoryOf(p: Proto): string {
  return p.category === null || p.category === '' ? 'Unknown' : p.category;
}

// ---- board selection -------------------------------------------------------

// Categories whose products are not standalone token-launch candidates:
// exchanges, bridges, staking wrappers, delta-neutral basis stablecoins and
// prediction markets. Liquid Restaking and Restaked BTC stay: they are
// infrastructure protocols that may still launch a token.
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'CEX',
  'Basis Trading',
  'Prediction Market',
]);

// Managed curator vaults are products of a curator, not protocols of their own.
const CURATOR_WORD = /\bcurator\b/i;
// A V2/V3 suffix marks a forked or upgraded duplicate; a V1 suffix is the
// original protocol, so it stays.
const VERSION_SUFFIX = /\s(V2|v2|2\.0|V3|v3|3\.0)$/;

export function isEarlyEligible(p: Proto): boolean {
  if (hasToken(p)) return false;
  if (EXCLUDED_CATEGORIES.has(categoryOf(p))) return false;
  if (CURATOR_WORD.test(p.name)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  return true;
}

// ---- model -----------------------------------------------------------------

const DAY_MS = 86_400_000;
const SIZE_CAP_USD = 100_000_000;
const SIZE_EXPONENT = 0.12;
const SHRINKAGE_PRIOR = 5;
const MAX_AGE_DAYS = 1095;

export function ageDays(p: Proto, snapshotTime: Date): number {
  if (p.listed_at === null) return 365;
  const listed = new Date(p.listed_at);
  if (Number.isNaN(listed.getTime())) return 365;
  const days = Math.floor((snapshotTime.getTime() - listed.getTime()) / DAY_MS);
  return days < 0 ? 0 : days;
}

export function computeModel(protocols: Proto[], snapshotTime: Date): ModelFacts {
  // Tokened comparables: a usable mcap/TVL ratio inside [0.005, 5].
  const ratios: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    const r = p.mcap_usd / p.tvl_usd;
    if (r >= 0.005 && r <= 5) ratios.push(r);
  }
  const globalMedian = median(ratios) ?? 0;
  const p25 = percentileExc(ratios, 0.25) ?? 0;
  const p75 = percentileExc(ratios, 0.75) ?? 0;

  const categories = [...new Set(protocols.map(categoryOf))].sort();
  const multiples: Record<string, CatMultiple> = {};
  const rawMedians: Record<string, CatRaw> = {};
  for (const cat of categories) {
    const catRatios: number[] = [];
    for (const p of protocols) {
      if (categoryOf(p) !== cat) continue;
      if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
      const r = p.mcap_usd / p.tvl_usd;
      if (r >= 0.005 && r <= 5) catRatios.push(r);
    }
    const n = catRatios.length;
    if (n === 0) {
      multiples[cat] = { multiple: clamp(globalMedian, 0.05, 1.0), n: 0 };
      rawMedians[cat] = { raw: null, winsor: null, n: 0 };
      continue;
    }
    const raw = median(catRatios) ?? 0;
    const winsor = median(catRatios.map((r) => clamp(r, p25, p75))) ?? 0;
    const multiple = clamp((n * winsor + SHRINKAGE_PRIOR * globalMedian) / (n + SHRINKAGE_PRIOR), 0.05, 1.0);
    multiples[cat] = { multiple, n };
    rawMedians[cat] = { raw, winsor, n };
  }

  // Category growth medians over every protocol in the category, tokened or
  // not, that reports a 7d change. Falls back to the global median change.
  const allChanges = protocols
    .map((p) => p.change_7d)
    .filter((c): c is number => c !== null);
  const globalGrowth = median(allChanges) ?? 0;
  const categoryGrowth: Record<string, number | null> = {};
  for (const cat of categories) {
    const changes = protocols
      .filter((p) => categoryOf(p) === cat && p.change_7d !== null)
      .map((p) => p.change_7d as number);
    categoryGrowth[cat] = changes.length > 0 ? median(changes) : globalGrowth;
  }

  return {
    snapshotTime,
    globalMultiple: globalMedian,
    p25,
    p75,
    multiples,
    rawMedians,
    categoryGrowth,
    globalGrowth,
  };
}

export interface ValueParts {
  multiple: number;
  comparables: number;
  rawMedian: number | null;
  winsorMedian: number | null;
  size: number;
  growth: number;
  growthPct: number;
  categoryMedianGrowth: number | null;
  maturity: number;
  age: number;
  implied: number;
}

export function valueProtocol(p: Proto, facts: ModelFacts): ValueParts {
  const cat = categoryOf(p);
  const entry = facts.multiples[cat] ?? { multiple: facts.globalMultiple, n: 0 };
  const raw = facts.rawMedians[cat] ?? { raw: null, winsor: null, n: 0 };
  const size = Math.min(1, Math.pow(SIZE_CAP_USD / p.tvl_usd, SIZE_EXPONENT));
  const catMedian = facts.categoryGrowth[cat] ?? facts.globalGrowth;
  const rel = p.change_7d === null ? 0 : p.change_7d - catMedian;
  const growthPct = clamp(rel, -50, 100);
  const growth = 1 + (growthPct / 100) * 0.4;
  const age = ageDays(p, facts.snapshotTime);
  const maturity = 0.65 + (Math.min(age, MAX_AGE_DAYS) / MAX_AGE_DAYS) * 0.35;
  const implied = Math.round(p.tvl_usd * entry.multiple * size * growth * maturity);
  return {
    multiple: entry.multiple,
    comparables: entry.n,
    rawMedian: raw.raw,
    winsorMedian: raw.winsor,
    size,
    growth,
    growthPct,
    categoryMedianGrowth: catMedian,
    maturity,
    age,
    implied,
  };
}

// Top tokened comparables in the same category, largest TVL first.
export function topComparables(p: Proto, protocols: Proto[], limit = 3): Proto[] {
  const cat = categoryOf(p);
  return protocols
    .filter((q) => q.slug !== p.slug && categoryOf(q) === cat && q.mcap_usd !== null && q.tvl_usd > 0)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, limit);
}

// ---- farm plan ---------------------------------------------------------------

// One template per farming style. The product and the two core actions are
// what changes; the 8-step shape is the same for every protocol.
const TEMPLATES: Record<string, FarmTemplate> = {
  Lending: {
    product: 'lending market',
    first: 'Supply USDC as collateral',
    second: 'Borrow 30% of collateral value in ETH',
  },
  Dexs: {
    product: 'liquidity pool',
    first: 'Add liquidity to the top pool (50/50)',
    second: 'Stake the LP token in the gauge',
  },
  Yield: {
    product: 'vault',
    first: 'Deposit into the highest-APY vault',
    second: 'Claim and restake rewards weekly',
  },
  RWA: {
    product: 'tokenized asset vault',
    first: 'Buy the tokenized T-bill share',
    second: 'Hold through the monthly distribution',
  },
  Derivatives: {
    product: 'perpetual market',
    first: 'Open a small hedged long (2x max)',
    second: 'Provide liquidity to the perp pool',
  },
  'Liquid Staking': {
    product: 'staking pool',
    first: 'Stake ETH for the liquid token',
    second: 'Use the liquid token as collateral in a lending market',
  },
  'Cross Chain': {
    product: 'bridge pool',
    first: 'Provide liquidity to the busiest bridge route',
    second: 'Run a relayer check daily',
  },
  CDP: {
    product: 'vault (mint stablecoin)',
    first: 'Lock collateral and mint the stablecoin',
    second: 'Keep the collateral ratio above 200%',
  },
  'Generic DeFi': {
    product: 'core pool',
    first: 'Deposit into the core pool',
    second: 'Stake the receipt token',
  },
};

// The closest farming style for categories without their own template.
const TEMPLATE_BY_CATEGORY: Record<string, string> = {
  'Yield Aggregator': 'Yield',
  'Leveraged Farming': 'Yield',
  Farm: 'Yield',
  Indexes: 'Yield',
  CeDeFi: 'Yield',
  'Risk Curators': 'Yield',
  'Onchain Capital Allocator': 'Yield',
  'Staking Pool': 'Liquid Staking',
  Restaking: 'Liquid Staking',
  'Liquid Restaking': 'Liquid Staking',
  'Restaked BTC': 'Liquid Staking',
  'Cross Chain Bridge': 'Cross Chain',
  'CDP Manager': 'CDP',
  'Dual-Token Stablecoin': 'CDP',
  'Algo-Stables': 'CDP',
  'Liquidity Manager': 'Dexs',
  Synthetics: 'Derivatives',
  Options: 'Derivatives',
};

export function templateFor(category: string): FarmTemplate {
  const key = TEMPLATES[category] !== undefined
    ? category
    : (TEMPLATE_BY_CATEGORY[category] ?? 'Generic DeFi');
  return TEMPLATES[key];
}

// Typical cost of one transaction on each chain, in USD.
const GAS_BY_CHAIN: Record<string, number> = {
  Ethereum: 12,
  Base: 1,
  Arbitrum: 1,
  Optimism: 1,
  Solana: 0.1,
  Binance: 0.5,
  BSC: 0.5,
  Polygon: 0.5,
  Avalanche: 1,
  Sui: 0.1,
  Aptos: 0.1,
};

const BRIDGE_BY_CHAIN: Record<string, string> = {
  Ethereum: 'the Ethereum canonical bridge',
  Base: 'Base Bridge',
  Arbitrum: 'Arbitrum Bridge',
  Optimism: 'Optimism Bridge',
  Solana: 'Wormhole',
  Binance: 'Binance Bridge',
  BSC: 'Binance Bridge',
  Polygon: 'Polygon Bridge',
  Avalanche: 'Avalanche Bridge',
  Sui: 'Sui Bridge',
  Aptos: 'Aptos Bridge',
};

export function mainChain(p: Proto): string {
  return p.chains.length > 0 ? p.chains[0] : 'Ethereum';
}

export function gasFor(chain: string): number {
  return GAS_BY_CHAIN[chain] ?? 1;
}

export function bridgeFor(chain: string): string {
  return BRIDGE_BY_CHAIN[chain] ?? 'a trusted cross-chain bridge';
}

// Capital tier from the row's TVL.
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 500_000_000) return 500;
  if (tvlUsd >= 100_000_000) return 250;
  if (tvlUsd >= 20_000_000) return 150;
  return 50;
}

function money(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2).replace(/0$/, '');
}

export interface FarmPlan {
  steps: string[];
  capitalUsd: number;
  gasUsd: number;
  totalText: string;
}

export function buildFarmPlan(p: Proto): FarmPlan {
  const chain = mainChain(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p.tvl_usd);
  const gasTotal = gas * 8;
  const t = templateFor(categoryOf(p));
  const g = money(gas);
  const steps = [
    `Bridge $${capital} to ${chain} via ${bridgeFor(chain)} (about $${g} gas, ~10 min). Keep $${money(gasTotal)} for gas.`,
    `Deposit $${capital} into ${p.name} ${t.product} on ${chain} (about $${g} gas). Confirm the position shows in the dashboard.`,
    `${t.first} (about $${g} gas, ~5 min). Screenshot the confirmation.`,
    `${t.second} (about $${g} gas). This is the core farming action — repeat weekly.`,
    `Join ${p.name} Discord/Telegram and verify the roles channel (free, ~10 min).`,
    `Complete the Galxe quest for ${p.name} if live (free, ~15 min).`,
    `Set a weekly reminder: re-check TVL and position every Monday (free, ~5 min).`,
    `Exit plan: withdraw when the token launches or TVL drops 30% from entry; unstake (about $${g} gas) and bridge back (about $${g} gas, ~15 min).`,
  ];
  return {
    steps,
    capitalUsd: capital,
    gasUsd: gasTotal,
    totalText: `Plan total: Capital $${capital} + about $${money(gasTotal)} gas on ${chain}.`,
  };
}
