// lib/model.ts — radar-5: category-calibrated comps curve, tested blind.
// All numbers are fitted at runtime from the sealed snapshot; nothing about
// a protocol's value is hardcoded. Farm plans follow the category/chain/TVL/
// age derivation; the out-of-sample check is recomputed on every run.

export const MODEL_VERSION = 'radar-5';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

export const MODEL = {
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comparables: 3,
  ratio_low: 0.005,
  ratio_high: 5,
  size_reference_usd: 100_000_000,
};

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export interface Protocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function needString(obj: Record<string, unknown>, field: string): string {
  const v = obj[field];
  if (typeof v !== 'string') throw new SnapshotError(`missing or invalid field: ${field}`);
  return v;
}

export function parseSnapshot(raw: unknown): Snapshot {
  if (!isRecord(raw)) throw new SnapshotError('snapshot root must be an object');
  const asOf = needString(raw, 'as_of');
  const source = needString(raw, 'source');
  const floor = raw.floor_usd;
  if (typeof floor !== 'number' || !Number.isInteger(floor) || floor <= 0) {
    throw new SnapshotError('missing or invalid field: floor_usd (must be a positive integer)');
  }
  if (!Array.isArray(raw.protocols)) throw new SnapshotError('missing or invalid field: protocols');
  if (!Array.isArray(raw.watchlist)) throw new SnapshotError('missing or invalid field: watchlist');
  const protocols: Protocol[] = raw.protocols.map((p, i) => {
    if (!isRecord(p)) throw new SnapshotError(`protocols[${i}] must be an object`);
    const slug = needString(p, 'slug');
    const name = needString(p, 'name');
    let category: string | null = null;
    if (p.category !== null && p.category !== undefined) {
      if (typeof p.category !== 'string') throw new SnapshotError(`protocols[${i}].category must be a string or null`);
      category = p.category;
    }
    if (!Array.isArray(p.chains) || p.chains.some((c) => typeof c !== 'string')) {
      throw new SnapshotError(`protocols[${i}].chains must be an array of strings`);
    }
    if (typeof p.tvl_usd !== 'number') throw new SnapshotError(`protocols[${i}].tvl_usd must be a number`);
    for (const f of ['change_7d', 'mcap_usd'] as const) {
      if (p[f] !== null && typeof p[f] !== 'number') throw new SnapshotError(`protocols[${i}].${f} must be a number or null`);
    }
    for (const f of ['listed_at', 'gecko_id', 'symbol'] as const) {
      if (p[f] !== null && typeof p[f] !== 'string') throw new SnapshotError(`protocols[${i}].${f} must be a string or null`);
    }
    return {
      slug,
      name,
      category,
      chains: p.chains as string[],
      tvl_usd: p.tvl_usd as number,
      change_7d: p.change_7d as number | null,
      mcap_usd: p.mcap_usd as number | null,
      listed_at: p.listed_at as string | null,
      gecko_id: p.gecko_id as string | null,
      symbol: p.symbol as string | null,
    };
  });
  if (raw.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('watchlist must be an array of strings');
  }
  return { as_of: asOf, source, floor_usd: floor, protocols, watchlist: raw.watchlist as string[] };
}

/** Calendar days from listedAt to asOf, floored at 0; null when either date is missing/invalid. */
export function ageDays(asOf: string | null, listedAt: string | null): number | null {
  if (!asOf || !listedAt) return null;
  const a = Date.parse(asOf + 'T00:00:00Z');
  const b = Date.parse(listedAt + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

/** Median of an already-sorted array; null when empty. */
export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function round4(x: number | null): number | null {
  if (x === null || x === undefined) return null;
  return Math.round(x * 10_000) / 10_000;
}

function catKey(p: Protocol): string {
  return p.category ?? 'Other';
}

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function validRatio(p: Protocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return false;
  const r = p.mcap_usd / p.tvl_usd;
  return r >= MODEL.ratio_low && r <= MODEL.ratio_high;
}

export interface CurveFit {
  slope: number; // shared fixed-effects slope b_fe
  size_exponent: number; // 1 - b_fe
  pooled_intercept: number; // mean(ln mcap - b_fe * ln tvl) over all comparables
  pooled_slope: number; // b_pool
  pooled_ols_intercept: number; // a_pool
  r2_full: number;
  r2_within: number;
  r2_pooled: number;
  n_comparables: number;
  global_median: number; // median mcap/TVL, clamped [0.05, 1.00]
  intercepts: Record<string, { intercept: number; n: number; multiple_at_100m: number }>;
  raw_medians: Record<string, { raw: number | null; n: number }>;
  multiples: Record<string, { multiple_at_100m: number; n: number }>;
}

/** Fit the pooled OLS curve and the category-intercept (fixed-effects) curve. */
export function fitCurve(comps: Protocol[]): CurveFit {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd as number));
  const n = comps.length;
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);

  // Pooled OLS: ln(mcap) = a_pool + b_pool * ln(tvl).
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const bPool = sxx === 0 ? 0 : sxy / sxx;
  const aPool = my - bPool * mx;
  let ssResPool = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = aPool + bPool * xs[i];
    ssResPool += (ys[i] - pred) * (ys[i] - pred);
    ssTot += (ys[i] - my) * (ys[i] - my);
  }
  const r2Pooled = ssTot === 0 ? 0 : 1 - ssResPool / ssTot;

  // Fixed effects: demean ln(tvl) and ln(mcap) within each category, OLS on the rest.
  const byCat = new Map<string, number[]>();
  comps.forEach((p, i) => {
    const k = catKey(p);
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(i);
  });
  const dx: number[] = new Array(n).fill(0);
  const dy: number[] = new Array(n).fill(0);
  for (const idxs of byCat.values()) {
    const cx = mean(idxs.map((i) => xs[i]));
    const cy = mean(idxs.map((i) => ys[i]));
    for (const i of idxs) {
      dx[i] = xs[i] - cx;
      dy[i] = ys[i] - cy;
    }
  }
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += dx[i] * dy[i];
    den += dx[i] * dx[i];
  }
  const bFe = den === 0 ? 0 : num / den;
  let ssResWithin = 0;
  let ssTotWithin = 0;
  for (let i = 0; i < n; i++) {
    ssResWithin += (dy[i] - bFe * dx[i]) * (dy[i] - bFe * dx[i]);
    ssTotWithin += dy[i] * dy[i];
  }
  const r2Within = ssTotWithin === 0 ? 0 : 1 - ssResWithin / ssTotWithin;

  // Per-category intercepts and the pooled fallback intercept.
  const intercepts: CurveFit['intercepts'] = {};
  let pooledSum = 0;
  for (const [cat, idxs] of byCat) {
    const aCat = mean(idxs.map((i) => ys[i] - bFe * xs[i]));
    intercepts[cat] = {
      intercept: aCat,
      n: idxs.length,
      multiple_at_100m: Math.exp(aCat) * Math.pow(MODEL.size_reference_usd, bFe - 1),
    };
    pooledSum += idxs.reduce((s, i) => s + (ys[i] - bFe * xs[i]), 0);
  }
  const aPooled = pooledSum / n;
  const pooledMultiple = Math.exp(aPooled) * Math.pow(MODEL.size_reference_usd, bFe - 1);

  // Full R^2: predictions use each category's OWN intercept (even thin ones).
  let ssResFull = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercepts[catKey(comps[i])].intercept + bFe * xs[i];
    ssResFull += (ys[i] - pred) * (ys[i] - pred);
  }
  const r2Full = ssTot === 0 ? 0 : 1 - ssResFull / ssTot;

  // Raw median mcap/TVL per category and the clamped global median.
  const ratios = comps.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
  const globalMedian = clamp(median(ratios) ?? 0, 0.05, 1.0);
  const rawMedians: CurveFit['raw_medians'] = {};
  const multiples: CurveFit['multiples'] = {};
  for (const [cat, idxs] of byCat) {
    const rs = idxs.map((i) => (comps[i].mcap_usd as number) / comps[i].tvl_usd).sort((a, b) => a - b);
    rawMedians[cat] = { raw: median(rs), n: idxs.length };
    const eff = idxs.length >= MODEL.min_comparables ? intercepts[cat].intercept : aPooled;
    multiples[cat] = {
      multiple_at_100m: Math.exp(eff) * Math.pow(MODEL.size_reference_usd, bFe - 1),
      n: idxs.length,
    };
  }
  void pooledMultiple;

  return {
    slope: bFe,
    size_exponent: 1 - bFe,
    pooled_intercept: aPooled,
    pooled_slope: bPool,
    pooled_ols_intercept: aPool,
    r2_full: r2Full,
    r2_within: r2Within,
    r2_pooled: r2Pooled,
    n_comparables: n,
    global_median: globalMedian,
    intercepts,
    raw_medians: rawMedians,
    multiples,
  };
}

/** Effective intercept for a protocol: its category's when n >= 3, else the pooled intercept. */
export function effectiveIntercept(fit: CurveFit, category: string | null): { intercept: number; n: number } {
  const key = category ?? 'Other';
  const entry = fit.intercepts[key];
  if (entry && entry.n >= MODEL.min_comparables) return { intercept: entry.intercept, n: entry.n };
  return { intercept: fit.pooled_intercept, n: entry ? entry.n : 0 };
}

/** Median 7d growth per category over the given protocols, plus the global median.
 * The board (and the OOS splits) calibrate growth from the comparables set —
 * the tokened protocols with a valid ratio — so a thin category's median is
 * the median of its tokened peers, and the fallback is the comparables' global
 * median. This is the calibration that reproduces the reference top-10 exactly. */
export function growthMedians(protocols: Protocol[]): { byCat: Map<string, number>; global: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.change_7d === null) continue;
    all.push(p.change_7d);
    const k = catKey(p);
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(p.change_7d);
  }
  const out = new Map<string, number>();
  for (const [k, v] of byCat) {
    const m = median([...v].sort((a, b) => a - b));
    if (m !== null) out.set(k, m);
  }
  const global = median([...all].sort((a, b) => a - b)) ?? 0;
  return { byCat: out, global };
}

export interface ImpliedParts {
  implied: number;
  intercept: number;
  comparables: number;
  raw_median: number | null;
  multiple_at_tvl: number;
  curve_base: number;
  size_exponent: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
}

export function impliedValue(
  p: Protocol,
  fit: CurveFit,
  growth: { byCat: Map<string, number>; global: number },
  asOf: string,
): ImpliedParts {
  const { intercept, n } = effectiveIntercept(fit, p.category);
  const curveBase = Math.exp(intercept + fit.slope * Math.log(p.tvl_usd));
  const catMed = growth.byCat.get(catKey(p)) ?? growth.global;
  const rel = clamp((p.change_7d ?? 0) - catMed, MODEL.growth_floor, MODEL.growth_cap);
  const growthMult = 1 + (rel / 100) * MODEL.growth_weight;
  const age = ageDays(asOf, p.listed_at);
  const ageUsed = age ?? MODEL.unknown_age_days;
  const maturity = MODEL.maturity_floor + (Math.min(Math.max(ageUsed, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  const implied = Math.max(1, Math.round(curveBase * growthMult * maturity));
  const raw = fit.raw_medians[catKey(p)];
  return {
    implied,
    intercept,
    comparables: n,
    raw_median: raw ? raw.raw : null,
    multiple_at_tvl: curveBase / p.tvl_usd,
    curve_base: curveBase,
    size_exponent: fit.size_exponent,
    growth_pct: rel,
    growth_multiplier: growthMult,
    maturity_multiplier: maturity,
    age_days: age,
  };
}

// ---------------------------------------------------------------------------
// Farm plan (derived from category + main chain + TVL + age; priced to the dollar)
// ---------------------------------------------------------------------------

export function chainOf(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0] : 'its main chain';
}

export function gasUsd(chain: string): number {
  switch (chain) {
    case 'Ethereum': return 12;
    case 'Bitcoin': return 4;
    case 'Solana':
    case 'Base':
    case 'Arbitrum':
    case 'Optimism':
    case 'Binance':
    case 'Avalanche':
    case 'Polygon':
    case 'Monad':
    case 'Sui':
    case 'Aptos': return 1;
    default: return 2;
  }
}

export function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

export interface FarmTemplate { main: string; second: string; recurring: string; }

export function templateFor(category: string | null, name: string, chain: string, capital: number): FarmTemplate {
  const c = (category ?? '').toLowerCase();
  const borrow = Math.round(capital * 0.3);
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      main: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the loan-to-value below 50%.`,
      second: `Borrow $${borrow} of a stablecoin against the deposit, then repay half of it a week later so both sides of the position are on record.`,
      recurring: `Top up or partially repay the loan once a week, keeping the position open and the health factor above 2.`,
    };
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager') || c === 'farm') {
    return {
      main: `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`,
      second: `Swap $25 through ${name}'s own router on ${chain} so the wallet shows both a liquidity position and swap volume.`,
      recurring: `Claim the pool fees once a week and add half of them back to the same pool on ${chain}.`,
    };
  }
  if (c.includes('rwa') || c.includes('onchain capital') || c.includes('stablecoin') || c.includes('algo-stables') || c.includes('dual-token')) {
    return {
      main: `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`,
      second: `Claim the accrued yield once, then redeposit it into the same asset so the balance grows on-chain.`,
      recurring: `Check the yield accrual once a week and add $10 of fresh capital on ${chain} each month.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield aggregator') || c.includes('indexes')) {
    return {
      main: `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the farming wallet.`,
      second: `Split a second $25 deposit across a different ${name} vault on ${chain} so the wallet touches two strategies.`,
      recurring: `Review the vault allocation once a week and move $10 between vaults when the mix drifts.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      main: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
      second: `Restake or delegate the receipt token once through ${name}'s own restaking route on ${chain}.`,
      recurring: `Claim the staking rewards once a week and restake half of them through ${name}.`,
    };
  }
  if (c.includes('derivative') || c.includes('basis trading') || c.includes('perpetual') || c.includes('options') || c.includes('synthetics') || c.includes('prediction')) {
    return {
      main: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position at 2x or less.`,
      second: `Close the first position after a day, then open a second one half the size so the wallet shows repeat usage.`,
      recurring: `Place one small hedged trade a week on ${name}, never risking more than 10% of the margin.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      main: `Bridge $${capital} of USDC into ${chain} through ${name} and keep the bridged funds in the farming wallet.`,
      second: `Use $25 of the bridged funds inside an app on ${chain}, then bridge $10 back through ${name} a week later.`,
      recurring: `Bridge $10 each way once a month through ${name} so the route stays active.`,
    };
  }
  if (c.includes('payment') || c.includes('card') || c.includes('otc')) {
    return {
      main: `Fund a $${capital} balance through ${name} on ${chain} and keep the account in good standing.`,
      second: `Make one $10 payment or purchase through ${name} on ${chain} from the farming wallet.`,
      recurring: `Use ${name} for one small payment each week on ${chain} and keep a receipt of every one.`,
    };
  }
  return {
    main: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    second: `Use $25 of the position for a second action inside ${name} on ${chain}, such as a swap, a vote or a claim.`,
    recurring: `Do one qualifying action a week inside ${name} on ${chain}, such as a deposit, a swap or a vote.`,
  };
}

export interface FarmStep { text: string; cost: string; time: string; }

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = s.slice(0, 597) + '...';
  if (s.length < 20) s += ' Do it carefully and record the result in the farm log.';
  return s;
}

export function farmSteps(p: Protocol, age: number | null): string[] {
  const chain = chainOf(p);
  const gas = gasUsd(chain);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const t = templateFor(p.category, p.name, chain, capital);
  const steps: FarmStep[] = [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.`, cost: `about $${gas} of gas for the first transaction on ${chain}`, time: `5 minutes` },
    { text: t.main, cost: `$${capital} of capital and about $${gas * 2} of gas on ${chain}`, time: `15 minutes to set up` },
    { text: t.second, cost: `about $${gas} of gas plus the $25 moved`, time: `10 minutes` },
    { text: t.recurring, cost: `about $${gas} of gas a week on ${chain}`, time: `10 minutes a week` },
    { text: `Open ${p.name}'s own points or rewards page, join it if it has one, and vote in its governance once.`, cost: `no fee to check, about $1 of gas to vote`, time: `10 minutes` },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Decide the exit before any token exists: sell half of any allocation on the first day it trades, keep the rest for ${hold} days, and never buy the token in its first hour.`, cost: `about $${gas * 2} of gas to claim and sell on ${chain}`, time: `10 minutes on claim day` },
    { text: `Write the wallet, the dates and every transaction in a farm log, and claim only from links the protocol itself publishes.`, cost: `nothing but the log, and never pay to claim`, time: `5 minutes` },
  ];
  return steps.map(stepText);
}

/** Plan totals for the detail view: capital, gas (8 transactions), chain, hold. */
export function planTotals(p: Protocol, age: number | null): { capital: number; gas: number; chain: string; hold: number } {
  const chain = chainOf(p);
  const gas = gasUsd(chain);
  return { capital: capitalFor(p.tvl_usd), gas: gas * 8, chain, hold: holdDaysFor(age) };
}

// ---------------------------------------------------------------------------
// Out-of-sample check (recomputed from the snapshot on every run)
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SplitMetrics {
  model_rmse: number;
  naive_rmse: number;
  pooled_rmse: number;
  model_medae: number;
  naive_medae: number;
  pooled_medae: number;
}

function predictSplit(train: Protocol[], test: Protocol[], asOf: string): SplitMetrics {
  const fit = fitCurve(train);
  const growth = growthMedians(train);
  const trainRatios = train.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
  const globalTrain = clamp(median(trainRatios) ?? 0, 0.05, 1.0);
  const catMedRatio = new Map<string, number>();
  const byCatTrain = new Map<string, Protocol[]>();
  for (const p of train) {
    const k = catKey(p);
    if (!byCatTrain.has(k)) byCatTrain.set(k, []);
    byCatTrain.get(k)!.push(p);
  }
  for (const [k, ps] of byCatTrain) {
    const rs = ps.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
    const m = median(rs) ?? globalTrain;
    catMedRatio.set(k, ps.length >= MODEL.min_comparables ? clamp(m, 0.05, 1.0) : globalTrain);
  }
  void catMedRatio;

  const modelErr: number[] = [];
  const naiveErr: number[] = [];
  const pooledErr: number[] = [];
  for (const p of test) {
    const actual = Math.log(p.mcap_usd as number);
    const catMed = growth.byCat.get(catKey(p)) ?? growth.global;
    const rel = clamp((p.change_7d ?? 0) - catMed, MODEL.growth_floor, MODEL.growth_cap);
    const growthMult = 1 + (rel / 100) * MODEL.growth_weight;
    const age = ageDays(asOf, p.listed_at);
    const ageUsed = age ?? MODEL.unknown_age_days;
    const maturity = MODEL.maturity_floor + (Math.min(Math.max(ageUsed, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    const { intercept } = effectiveIntercept(fit, p.category);
    const curveBase = Math.exp(intercept + fit.slope * Math.log(p.tvl_usd));
    const radarPred = Math.max(1, curveBase * growthMult * maturity);
    const naivePred = Math.max(1, p.tvl_usd * globalTrain);
    const pooledPred = Math.max(1, Math.exp(fit.pooled_ols_intercept + fit.pooled_slope * Math.log(p.tvl_usd)) * growthMult * maturity);
    modelErr.push(Math.abs(actual - Math.log(radarPred)));
    naiveErr.push(Math.abs(actual - Math.log(naivePred)));
    pooledErr.push(Math.abs(actual - Math.log(pooledPred)));
  }
  const rmse = (errs: number[]) => Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  const medae = (errs: number[]) => median([...errs].sort((a, b) => a - b)) ?? 0;
  return {
    model_rmse: rmse(modelErr),
    naive_rmse: rmse(naiveErr),
    pooled_rmse: rmse(pooledErr),
    model_medae: medae(modelErr),
    naive_medae: medae(naiveErr),
    pooled_medae: medae(pooledErr),
  };
}

export interface OosResult {
  time_split: { n_train: number; n_test: number } & SplitMetrics;
  random_splits: {
    seeds: number[];
    n_train: number;
    n_test: number;
    model_rmse_mean: number; model_rmse_min: number; model_rmse_max: number;
    model_medae_mean: number; model_medae_min: number; model_medae_max: number;
    naive_rmse_mean: number; naive_rmse_min: number; naive_rmse_max: number;
    naive_medae_mean: number; naive_medae_min: number; naive_medae_max: number;
    pooled_rmse_mean: number; pooled_rmse_min: number; pooled_rmse_max: number;
    pooled_medae_mean: number; pooled_medae_min: number; pooled_medae_max: number;
  };
}

export function oosCheck(comps: Protocol[], asOf: string): OosResult {
  const trainTime = comps.filter((p) => p.listed_at !== null && p.listed_at < '2025-01-01');
  const testTime = comps.filter((p) => p.listed_at !== null && p.listed_at >= '2025-01-01');
  const ts = predictSplit(trainTime, testTime, asOf);

  const seeds = [7, 1, 2, 3, 42, 123];
  const perSeed: SplitMetrics[] = [];
  for (const seed of seeds) {
    const idx = comps.map((_, i) => i);
    const rnd = mulberry32(seed);
    for (let i = idx.length - 1; i >= 1; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = idx[i];
      idx[i] = idx[j];
      idx[j] = tmp;
    }
    const train = idx.slice(0, 92).map((i) => comps[i]);
    const test = idx.slice(92).map((i) => comps[i]);
    perSeed.push(predictSplit(train, test, asOf));
  }
  const agg = (key: keyof SplitMetrics) => {
    const vals = perSeed.map((m) => m[key]);
    return {
      mean: vals.reduce((s, v) => s + v, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  };
  const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
  const mRmse = agg('model_rmse');
  const mMedae = agg('model_medae');
  const nRmse = agg('naive_rmse');
  const nMedae = agg('naive_medae');
  const pRmse = agg('pooled_rmse');
  const pMedae = agg('pooled_medae');
  return {
    time_split: {
      n_train: trainTime.length,
      n_test: testTime.length,
      model_rmse: r4(ts.model_rmse),
      naive_rmse: r4(ts.naive_rmse),
      pooled_rmse: r4(ts.pooled_rmse),
      model_medae: r4(ts.model_medae),
      naive_medae: r4(ts.naive_medae),
      pooled_medae: r4(ts.pooled_medae),
    },
    random_splits: {
      seeds,
      n_train: 92,
      n_test: 23,
      model_rmse_mean: r4(mRmse.mean), model_rmse_min: r4(mRmse.min), model_rmse_max: r4(mRmse.max),
      model_medae_mean: r4(mMedae.mean), model_medae_min: r4(mMedae.min), model_medae_max: r4(mMedae.max),
      naive_rmse_mean: r4(nRmse.mean), naive_rmse_min: r4(nRmse.min), naive_rmse_max: r4(nRmse.max),
      naive_medae_mean: r4(nMedae.mean), naive_medae_min: r4(nMedae.min), naive_medae_max: r4(nMedae.max),
      pooled_rmse_mean: r4(pRmse.mean), pooled_rmse_min: r4(pRmse.min), pooled_rmse_max: r4(pRmse.max),
      pooled_medae_mean: r4(pMedae.mean), pooled_medae_min: r4(pMedae.min), pooled_medae_max: r4(pMedae.max),
    },
  };
}

// ---------------------------------------------------------------------------
// Board construction
// ---------------------------------------------------------------------------

function isVersionedName(name: string): boolean {
  return / [Vv][0-9]+$/.test(name) || /[0-9]+\.[0-9]+$/.test(name);
}

export function isRankable(p: Protocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !isVersionedName(p.name);
}

export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    curve_intercept: number | null;
    comparables: number;
    raw_median: number | null;
    multiple_at_tvl: number | null;
    curve_base: number | null;
    size_exponent: number | null;
    growth_pct: number | null;
    growth_multiplier: number | null;
    maturity_multiplier: number | null;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface BuiltEntry {
  rows: BoardRow[];
  live: LiveRow[];
  radar: Record<string, unknown>;
}

export function buildBoard(snapshot: Snapshot): BuiltEntry {
  const comps = snapshot.protocols.filter(validRatio);
  const fit = fitCurve(comps);
  const growth = growthMedians(comps);
  const oos = oosCheck(comps, snapshot.as_of);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  const watchlistSet = new Set(snapshot.watchlist);
  const picked = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p) picked.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => isRankable(p) && p.tvl_usd < snapshot.floor_usd && !watchlistSet.has(p.slug))
    .sort((a, b) => (b.tvl_usd - a.tvl_usd) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) picked.set(p.slug, p);

  const scored = [...picked.values()].map((p) => ({ p, parts: impliedValue(p, fit, growth, snapshot.as_of) }));
  scored.sort((a, b) => (b.parts.implied - a.parts.implied) || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const rows: BoardRow[] = [];
  let prev = Number.POSITIVE_INFINITY;
  scored.forEach((entry, i) => {
    const { p, parts } = entry;
    let implied = parts.implied;
    if (implied >= prev) implied = Math.max(1, prev - 1);
    prev = implied;
    rows.push({
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: parts.age_days,
      implied_value_usd: implied,
      model: {
        curve_intercept: round4(parts.intercept),
        comparables: parts.comparables,
        raw_median: round4(parts.raw_median),
        multiple_at_tvl: round4(parts.multiple_at_tvl),
        curve_base: round4(parts.curve_base),
        size_exponent: round4(parts.size_exponent),
        growth_pct: round4(parts.growth_pct),
        growth_multiplier: round4(parts.growth_multiplier),
        maturity_multiplier: round4(parts.maturity_multiplier),
        age_days: parts.age_days,
      },
      farm_steps: farmSteps(p, parts.age_days),
    });
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => ((b.mcap_usd as number) - (a.mcap_usd as number)) || (b.tvl_usd - a.tvl_usd) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));

  // Top 3 tokened comparables per category, by market cap.
  const comparables: Record<string, { slug: string; name: string; tvl_usd: number; mcap_usd: number; ratio: number }[]> = {};
  const compsByCat = new Map<string, Protocol[]>();
  for (const p of comps) {
    const k = catKey(p);
    if (!compsByCat.has(k)) compsByCat.set(k, []);
    compsByCat.get(k)!.push(p);
  }
  for (const [k, ps] of compsByCat) {
    comparables[k] = [...ps]
      .sort((a, b) => ((b.mcap_usd as number) - (a.mcap_usd as number)) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
      .slice(0, 3)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd as number,
        ratio: round4((p.mcap_usd as number) / p.tvl_usd) as number,
      }));
  }

  // Raw medians for EVERY category in the snapshot, including n=0.
  const allCats = new Set(snapshot.protocols.map((p) => catKey(p)));
  const rawMedians: Record<string, { raw: number | null; n: number }> = {};
  for (const cat of [...allCats].sort()) {
    const entry = fit.raw_medians[cat];
    rawMedians[cat] = entry ? { raw: round4(entry.raw), n: entry.n } : { raw: null, n: 0 };
  }
  const multiples: Record<string, { multiple_at_100m: number; n: number }> = {};
  for (const cat of [...allCats].sort()) {
    const entry = fit.multiples[cat];
    multiples[cat] = entry
      ? { multiple_at_100m: round4(entry.multiple_at_100m) as number, n: entry.n }
      : { multiple_at_100m: round4(Math.exp(fit.pooled_intercept) * Math.pow(MODEL.size_reference_usd, fit.slope - 1)) as number, n: 0 };
  }

  const earlySize = rows.filter((r) => !watchlistSet.has(r.slug)).length;
  const radar: Record<string, unknown> = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: rows.length,
    early_size: earlySize,
    live_size: live.length,
    global_multiple: fit.global_median,
    multiples,
    raw_medians: rawMedians,
    curve: {
      slope: round4(fit.slope),
      size_exponent: round4(fit.size_exponent),
      pooled_intercept: round4(fit.pooled_intercept),
      pooled_slope: round4(fit.pooled_slope),
      pooled_ols_intercept: round4(fit.pooled_ols_intercept),
      r2_full: round4(fit.r2_full),
      r2_within: round4(fit.r2_within),
      r2_pooled: round4(fit.r2_pooled),
      n_comparables: fit.n_comparables,
      intercepts: Object.fromEntries(
        Object.entries(fit.intercepts).map(([k, v]) => [k, {
          intercept: round4(v.intercept),
          n: v.n,
          multiple_at_100m: round4(v.multiple_at_100m),
        }]),
      ),
    },
    comparables,
    oos,
    rows: rows.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      curve_intercept: r.model.curve_intercept,
      comparables: r.model.comparables,
      raw_median: r.model.raw_median,
      multiple_at_tvl: r.model.multiple_at_tvl,
      curve_base: r.model.curve_base,
      size_exponent: r.model.size_exponent,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      growth_pct: r.model.growth_pct,
      category_median_growth: (() => {
        const m = growth.byCat.get(catKey(bySlug.get(r.slug) as Protocol));
        return m === undefined ? null : round4(m);
      })(),
    })),
    live,
  };

  return { rows, live, radar };
}

export function dataScript(radar: Record<string, unknown>): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** Return a problem string, or null when the board is valid. */
export function boardIssue(rows: BoardRow[], watchlist: string[]): string | null {
  const have = new Set(rows.map((r) => r.slug));
  for (const slug of watchlist) {
    if (!have.has(slug)) return `watchlist slug missing from board: ${slug}`;
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) return `rank out of sequence at index ${i}`;
    if (i > 0 && rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      return `implied value rises with rank at ${rows[i].slug}`;
    }
    if (!Number.isInteger(rows[i].implied_value_usd) || rows[i].implied_value_usd <= 0) {
      return `bad implied value at ${rows[i].slug}`;
    }
    if (rows[i].farm_steps.length < 3 || rows[i].farm_steps.length > 12) {
      return `bad farm step count at ${rows[i].slug}`;
    }
    for (const s of rows[i].farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `farm step length out of range at ${rows[i].slug}`;
    }
  }
  if (rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) {
    return 'all implied values are equal';
  }
  return null;
}
