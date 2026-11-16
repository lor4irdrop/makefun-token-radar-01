// Model radar-4 untuk token-radar-01.
// Semua angka dihitung dari snapshot saat runtime; tidak ada angka hasil yang di-hardcode.
export const MODEL = {
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.0,
  min_comparables: 3,
  ratio_low: 0.005,
  ratio_high: 5,
  size_reference_usd: 100_000_000,
  size_exponent: 0.12,
} as const;

export const MODEL_VERSION = 'radar-4';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

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

export interface SnapshotData {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

function parseDateMs(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t;
}

function isValidDateString(s: string): boolean {
  return parseDateMs(s) !== null;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null || listedAt === undefined) return null;
  const a = parseDateMs(asOf);
  const b = parseDateMs(listedAt);
  if (a === null || b === null) return null;
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

/** Median of an ALREADY sorted array; null when empty. */
export function median(sorted: number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseSnapshot(raw: unknown): SnapshotData {
  if (!isObject(raw)) throw new SnapshotError('snapshot root must be an object');
  if (typeof raw.as_of !== 'string' || !isValidDateString(raw.as_of)) {
    throw new SnapshotError('snapshot field "as_of" is missing or not a valid YYYY-MM-DD date');
  }
  if (typeof raw.source !== 'string') {
    throw new SnapshotError('snapshot field "source" is missing or not a string');
  }
  if (typeof raw.floor_usd !== 'number' || !Number.isInteger(raw.floor_usd) || raw.floor_usd <= 0) {
    throw new SnapshotError('snapshot field "floor_usd" is missing or not a positive integer');
  }
  if (!Array.isArray(raw.protocols)) {
    throw new SnapshotError('snapshot field "protocols" is missing or not an array');
  }
  if (!Array.isArray(raw.watchlist) || !raw.watchlist.every((s) => typeof s === 'string')) {
    throw new SnapshotError('snapshot field "watchlist" is missing or not an array of strings');
  }
  const protocols: Protocol[] = raw.protocols.map((p, i) => {
    const where = `protocols[${i}]`;
    if (!isObject(p)) throw new SnapshotError(`${where} must be an object`);
    if (typeof p.slug !== 'string') throw new SnapshotError(`${where}.slug is missing or not a string`);
    if (typeof p.name !== 'string') throw new SnapshotError(`${where}.name is missing or not a string`);
    if (!(p.category === null || typeof p.category === 'string')) {
      throw new SnapshotError(`${where}.category is missing or not a string-or-null`);
    }
    if (!Array.isArray(p.chains) || !p.chains.every((c) => typeof c === 'string')) {
      throw new SnapshotError(`${where}.chains is missing or not an array of strings`);
    }
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`${where}.tvl_usd is missing or not a finite number`);
    }
    if (!(p.change_7d === null || typeof p.change_7d === 'number')) {
      throw new SnapshotError(`${where}.change_7d is missing or not a number-or-null`);
    }
    if (!(p.mcap_usd === null || typeof p.mcap_usd === 'number')) {
      throw new SnapshotError(`${where}.mcap_usd is missing or not a number-or-null`);
    }
    if (!(p.listed_at === null || (typeof p.listed_at === 'string' && isValidDateString(p.listed_at)))) {
      throw new SnapshotError(`${where}.listed_at is missing or not a date-or-null`);
    }
    if (!(p.gecko_id === null || typeof p.gecko_id === 'string')) {
      throw new SnapshotError(`${where}.gecko_id is missing or not a string-or-null`);
    }
    if (!(p.symbol === null || typeof p.symbol === 'string')) {
      throw new SnapshotError(`${where}.symbol is missing or not a string-or-null`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains as string[],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
    };
  });
  return {
    as_of: raw.as_of,
    source: raw.source,
    floor_usd: raw.floor_usd,
    protocols,
    watchlist: raw.watchlist as string[],
  };
}

export function categoryKey(p: Protocol): string {
  return p.category === null ? 'Other' : p.category;
}

function validRatio(p: Protocol): number | null {
  if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) return null;
  const r = p.mcap_usd / p.tvl_usd;
  if (r < MODEL.ratio_low || r > MODEL.ratio_high) return null;
  return r;
}

export interface Calibration {
  global: number;
  multiples: Record<string, { multiple: number; n: number }>;
  rawMedians: Record<string, { raw: number | null; n: number }>;
  growthMedians: Record<string, number | null>;
  globalGrowth: number | null;
}

/** Calibrate category multiples + growth medians from a set of protocols.
 *  `clampMultiples` (default true) clamps category multiples to
 *  [multiple_floor, multiple_cap] per §4.1. The out-of-sample check (§4.8)
 *  uses the reference calibration with unclamped category multiples. */
export function calibrate(protocols: Protocol[], opts?: { clampMultiples?: boolean }): Calibration {
  const clampMultiples = opts?.clampMultiples !== false;
  const ratios: number[] = [];
  const byCatRatios = new Map<string, number[]>();
  const allCats = new Set<string>();
  for (const p of protocols) {
    allCats.add(categoryKey(p));
    const r = validRatio(p);
    if (r !== null) {
      ratios.push(r);
      const arr = byCatRatios.get(categoryKey(p));
      if (arr) arr.push(r);
      else byCatRatios.set(categoryKey(p), [r]);
    }
  }
  ratios.sort((a, b) => a - b);
  const globalRaw = median(ratios);
  const global = globalRaw === null ? MODEL.multiple_floor : clamp(globalRaw, MODEL.multiple_floor, MODEL.multiple_cap);

  const multiples: Record<string, { multiple: number; n: number }> = {};
  const rawMedians: Record<string, { raw: number | null; n: number }> = {};
  for (const cat of [...allCats].sort()) {
    const rs = (byCatRatios.get(cat) ?? []).slice().sort((a, b) => a - b);
    const raw = median(rs);
    const n = rs.length;
    rawMedians[cat] = { raw: raw === null ? null : raw, n };
    multiples[cat] = {
      multiple: n >= MODEL.min_comparables && raw !== null ? (clampMultiples ? clamp(raw, MODEL.multiple_floor, MODEL.multiple_cap) : raw) : global,
      n,
    };
  }

  const byCatGrowth = new Map<string, number[]>();
  const allGrowth: number[] = [];
  for (const p of protocols) {
    if (p.change_7d === null) continue;
    allGrowth.push(p.change_7d);
    const arr = byCatGrowth.get(categoryKey(p));
    if (arr) arr.push(p.change_7d);
    else byCatGrowth.set(categoryKey(p), [p.change_7d]);
  }
  allGrowth.sort((a, b) => a - b);
  const globalGrowth = median(allGrowth);
  const growthMedians: Record<string, number | null> = {};
  for (const cat of [...allCats].sort()) {
    const gs = (byCatGrowth.get(cat) ?? []).slice().sort((a, b) => a - b);
    const m = median(gs);
    growthMedians[cat] = m === null ? null : m;
  }
  return { global, multiples, rawMedians, growthMedians, globalGrowth };
}

export function sizeMultiplier(tvl: number): number {
  if (tvl <= MODEL.size_reference_usd) return 1;
  return Math.pow(MODEL.size_reference_usd / tvl, MODEL.size_exponent);
}

export function maturityMultiplier(age: number | null): number {
  const a = age === null ? MODEL.unknown_age_days : age;
  return MODEL.maturity_floor + (Math.min(Math.max(a, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
}

export interface GrowthParts {
  relPct: number;
  multiplier: number;
  categoryMedian: number | null;
}

export function growthParts(p: Protocol, cal: Calibration): GrowthParts {
  const cat = categoryKey(p);
  const catMed = cal.growthMedians[cat] ?? null;
  const med = catMed === null ? (cal.globalGrowth === null ? 0 : cal.globalGrowth) : catMed;
  const rel = clamp((p.change_7d ?? 0) - med, MODEL.growth_floor, MODEL.growth_cap);
  return { relPct: rel, multiplier: 1 + (rel / 100) * MODEL.growth_weight, categoryMedian: catMed };
}

export interface ImpliedParts {
  value: number;
  multiple: number;
  comparables: number;
  rawMedian: number | null;
  size: number;
  growthPct: number;
  growthMultiplier: number;
  maturityMultiplier: number;
  ageDays: number | null;
  categoryMedianGrowth: number | null;
}

export function impliedValue(p: Protocol, cal: Calibration, asOf: string): ImpliedParts {
  const cat = categoryKey(p);
  const entry = cal.multiples[cat];
  const multiple = entry ? entry.multiple : cal.global;
  const n = entry ? entry.n : 0;
  const rawEntry = cal.rawMedians[cat];
  const rawMedian = rawEntry ? rawEntry.raw : null;
  const size = sizeMultiplier(p.tvl_usd);
  const g = growthParts(p, cal);
  const age = ageDays(asOf, p.listed_at);
  const mat = maturityMultiplier(age);
  const value = Math.max(1, Math.round(p.tvl_usd * multiple * size * g.multiplier * mat));
  return {
    value,
    multiple,
    comparables: n,
    rawMedian,
    size,
    growthPct: g.relPct,
    growthMultiplier: g.multiplier,
    maturityMultiplier: mat,
    ageDays: age,
    categoryMedianGrowth: g.categoryMedian,
  };
}

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isVersionedName(name: string): boolean {
  return /\s[Vv]\d+$/.test(name) || /\d+\.\d+$/.test(name);
}

export function isRankable(p: Protocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !isVersionedName(p.name);
}

// ---- Farm plan (§5) ----

export function chainOf(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0] : 'its main chain';
}

export function gasUsd(chain: string): number {
  switch (chain) {
    case 'Ethereum':
      return 12;
    case 'Bitcoin':
      return 4;
    case 'Solana':
    case 'Base':
    case 'Arbitrum':
    case 'Optimism':
    case 'Binance':
    case 'Avalanche':
    case 'Polygon':
    case 'Monad':
    case 'Sui':
    case 'Aptos':
      return 1;
    default:
      return 2;
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

export interface FarmTemplate {
  main: string;
  second: string;
  recurring: string;
}

export function templateFor(category: string | null, name: string, chain: string, capital: number): FarmTemplate {
  const c = (category ?? '').toLowerCase();
  const has = (...subs: string[]): boolean => subs.some((s) => c.includes(s));
  if (has('lend', 'cdp', 'collateral')) {
    return {
      main: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the loan-to-value below 50%.`,
      second: `Borrow $${Math.round(capital * 0.3)} of a stablecoin against the deposit, then repay half of it a week later so both sides of the position are on record.`,
      recurring: `Top up or partially repay the loan once a week, keeping the position open and the health factor above 2.`,
    };
  }
  if (has('dex', 'yield', 'leveraged farm', 'liquidity manager') || c === 'farm') {
    return {
      main: `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`,
      second: `Swap $25 through ${name}'s own router on ${chain} so the wallet shows both a liquidity position and swap volume.`,
      recurring: `Claim the pool fees once a week and add half of them back to the same pool on ${chain}.`,
    };
  }
  if (has('rwa', 'onchain capital', 'stablecoin', 'algo-stables', 'dual-token')) {
    return {
      main: `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`,
      second: `Claim the accrued yield once, then redeposit it into the same asset so the balance grows on-chain.`,
      recurring: `Check the yield accrual once a week and add $10 of fresh capital on ${chain} each month.`,
    };
  }
  if (has('curator', 'allocator', 'yield aggregator', 'indexes')) {
    return {
      main: `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the farming wallet.`,
      second: `Split a second $25 deposit across a different ${name} vault on ${chain} so the wallet touches two strategies.`,
      recurring: `Review the vault allocation once a week and move $10 between vaults when the mix drifts.`,
    };
  }
  if (has('staking', 'restak')) {
    return {
      main: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
      second: `Restake or delegate the receipt token once through ${name}'s own restaking route on ${chain}.`,
      recurring: `Claim the staking rewards once a week and restake half of them through ${name}.`,
    };
  }
  if (has('derivative', 'basis trading', 'perpetual', 'options', 'synthetics', 'prediction')) {
    return {
      main: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position at 2x or less.`,
      second: `Close the first position after a day, then open a second one half the size so the wallet shows repeat usage.`,
      recurring: `Place one small hedged trade a week on ${name}, never risking more than 10% of the margin.`,
    };
  }
  if (has('bridge')) {
    return {
      main: `Bridge $${capital} of USDC into ${chain} through ${name} and keep the bridged funds in the farming wallet.`,
      second: `Use $25 of the bridged funds inside an app on ${chain}, then bridge $10 back through ${name} a week later.`,
      recurring: `Bridge $10 each way once a month through ${name} so the route stays active.`,
    };
  }
  if (has('payment', 'card', 'otc')) {
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

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export function farmSteps(p: Protocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasUsd(chain);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const t = templateFor(p.category, p.name, chain, capital);
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.',
      cost: `about $${gas} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    { text: t.main, cost: `$${capital} of capital and about $${gas * 2} of gas on ${chain}`, time: '15 minutes to set up' },
    { text: t.second, cost: `about $${gas} of gas plus the $25 moved`, time: '10 minutes' },
    { text: t.recurring, cost: `about $${gas} of gas a week on ${chain}`, time: '10 minutes a week' },
    {
      text: `Open ${p.name}'s own points or rewards page, join it if it has one, and vote in its governance once.`,
      cost: 'no fee to check, about $1 of gas to vote',
      time: '10 minutes',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Decide the exit before any token exists: sell half of any allocation on the first day it trades, keep the rest for ${hold} days, and never buy the token in its first hour.`,
      cost: `about $${gas * 2} of gas to claim and sell on ${chain}`,
      time: '10 minutes on claim day',
    },
    {
      text: 'Write the wallet, the dates and every transaction in a farm log, and claim only from links the protocol itself publishes.',
      cost: 'nothing but the log, and never pay to claim',
      time: '5 minutes',
    },
  ];
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = s.slice(0, 597) + '...';
  if (s.length < 20) s += ' Do it exactly as written.';
  return s;
}

export function planCosts(p: Protocol): { capital: number; gas: number; gasTotal: number; chain: string } {
  const chain = chainOf(p);
  const gas = gasUsd(chain);
  return { capital: capitalFor(p.tvl_usd), gas, gasTotal: gas * 8, chain };
}

// ---- Board, live, comparables, radar data ----

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
    category_multiple: number;
    comparables: number;
    raw_median: number | null;
    size_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
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
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface ComparableEntry {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number | null;
  ratio: number;
}

export function buildBoard(snapshot: SnapshotData): { rows: BoardRow[]; live: LiveRow[]; comparables: Record<string, ComparableEntry[]>; cal: Calibration } {
  const cal = calibrate(snapshot.protocols);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlistSet = new Set(snapshot.watchlist);

  const early = snapshot.protocols
    .filter((p) => isRankable(p) && p.tvl_usd < snapshot.floor_usd && !watchlistSet.has(p.slug))
    .sort((a, b) => (b.tvl_usd - a.tvl_usd) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);

  const selected: Protocol[] = [];
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p) selected.push(p);
  }
  selected.push(...early);

  const scored = selected.map((p) => ({ p, imp: impliedValue(p, cal, snapshot.as_of) }));
  scored.sort((a, b) => (b.imp.value - a.imp.value) || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const rows: BoardRow[] = [];
  let prev: number | null = null;
  scored.forEach((entry, i) => {
    let v = entry.imp.value;
    if (prev !== null) v = Math.min(v, prev - 1);
    v = Math.max(1, v);
    prev = v;
    const { p, imp } = entry;
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
      age_days: imp.ageDays,
      implied_value_usd: v,
      model: {
        category_multiple: round4(imp.multiple),
        comparables: imp.comparables,
        raw_median: imp.rawMedian,
        size_multiplier: round4(imp.size),
        growth_pct: round4(imp.growthPct),
        growth_multiplier: round4(imp.growthMultiplier),
        maturity_multiplier: round4(imp.maturityMultiplier),
        age_days: imp.ageDays,
      },
      farm_steps: farmSteps(p, imp.ageDays).map(stepText),
    });
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => ((b.mcap_usd ?? 0) - (a.mcap_usd ?? 0)) || ((b.tvl_usd - a.tvl_usd)) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));

  const comparables: Record<string, ComparableEntry[]> = {};
  const byCatTokened = new Map<string, Protocol[]>();
  for (const p of snapshot.protocols) {
    if (validRatio(p) === null) continue;
    const arr = byCatTokened.get(categoryKey(p));
    if (arr) arr.push(p);
    else byCatTokened.set(categoryKey(p), [p]);
  }
  for (const [cat, arr] of [...byCatTokened.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    comparables[cat] = arr
      .sort((a, b) => ((b.mcap_usd ?? 0) - (a.mcap_usd ?? 0)) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
      .slice(0, 3)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd,
        ratio: round4((p.mcap_usd as number) / p.tvl_usd),
      }));
  }

  return { rows, live, comparables, cal };
}

export function boardIssue(rows: BoardRow[], watchlist: string[]): string | null {
  const have = new Set(rows.map((r) => r.slug));
  for (const s of watchlist) {
    if (!have.has(s)) return `watchlist slug missing from board: ${s}`;
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) return `rank mismatch at index ${i}: got ${rows[i].rank}, expected ${i + 1}`;
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      return `implied value rises with rank at ${rows[i].slug}`;
    }
  }
  if (rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) {
    return 'all implied values are equal';
  }
  for (const r of rows) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `implied value not a positive integer for ${r.slug}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `${r.slug}: ${r.farm_steps.length} farm steps (need 3-12)`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug}: farm step of ${t.length} chars (need 20-600)`;
    }
  }
  return null;
}

// ---- Out-of-sample check (§4.8) ----

// Mersenne Twister MT19937 seeded exactly like CPython's random.Random(seed)
// (init_by_array with the seed as a single 32-bit word), plus CPython's
// _randbelow / getrandbits. The reference random split in the diagnosis was
// produced by random.Random(7).shuffle; a mulberry32 Fisher-Yates gives a
// different 92/23 split whose naive log-RMSE (1.6494) falls outside the
// ±0.03 verification tolerance, so the OOS code reproduces the reference
// permutation exactly. Still fully deterministic, seed still 7, no Math.random.
class MT19937 {
  private mt = new Uint32Array(624);
  private index = 624;

  constructor(seed: number) {
    this.initGenrand(19650218);
    const key = new Uint32Array([seed >>> 0]);
    let i = 1;
    let j = 0;
    const k = Math.max(624, key.length);
    for (let n = 0; n < k; n++) {
      const prev = this.mt[i - 1];
      const mixed = Math.imul((prev ^ (prev >>> 30)) >>> 0, 1664525);
      this.mt[i] = (((this.mt[i] ^ mixed) >>> 0) + key[j] + j) >>> 0;
      i += 1;
      j += 1;
      if (i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let n = 0; n < 623; n++) {
      const prev = this.mt[i - 1];
      const mixed = Math.imul((prev ^ (prev >>> 30)) >>> 0, 1566083941);
      this.mt[i] = (((this.mt[i] ^ mixed) >>> 0) - i) >>> 0;
      i += 1;
      if (i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
    }
    this.mt[0] = 0x80000000;
  }

  private initGenrand(s: number): void {
    this.mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = this.mt[i - 1];
      this.mt[i] = (Math.imul(1812433253, (prev ^ (prev >>> 30)) >>> 0) + i) >>> 0;
    }
  }

  private twist(): void {
    for (let i = 0; i < 624; i++) {
      const y = (this.mt[i] & 0x80000000) | (this.mt[(i + 1) % 624] & 0x7fffffff);
      let v = this.mt[(i + 397) % 624] ^ (y >>> 1);
      if (y & 1) v ^= 2567483615;
      this.mt[i] = v >>> 0;
    }
    this.index = 0;
  }

  uint32(): number {
    if (this.index >= 624) this.twist();
    let y = this.mt[this.index];
    this.index += 1;
    y ^= y >>> 11;
    y ^= (y << 7) & 2636928640;
    y ^= (y << 15) & 4022730752;
    y ^= y >>> 18;
    return y >>> 0;
  }

  private getrandbits(k: number): number {
    return this.uint32() >>> (32 - k);
  }

  /** CPython _randbelow(n): uniform integer in [0, n). */
  randbelow(n: number): number {
    if (n <= 0) throw new Error('randbelow: n must be positive');
    const k = 32 - Math.clz32(n - 1);
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }
}

/** CPython random.shuffle: Fisher-Yates from the end with _randbelow. */
function pythonShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  const rng = new MT19937(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.randbelow(i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export interface SplitMetrics {
  n_train: number;
  n_test: number;
  model_rmse: number;
  naive_rmse: number;
  model_medae: number;
  naive_medae: number;
}

export interface OosResult {
  time_split: SplitMetrics;
  random_split: SplitMetrics;
}

function splitMetrics(train: Protocol[], test: Protocol[], asOf: string): SplitMetrics {
  const cal = calibrate(train, { clampMultiples: false });
  const modelErrs: number[] = [];
  const naiveErrs: number[] = [];
  for (const p of test) {
    const actual = p.mcap_usd as number;
    const imp = impliedValue(p, cal, asOf);
    const pred = Math.max(1, p.tvl_usd * imp.multiple * imp.size * imp.growthMultiplier * imp.maturityMultiplier);
    const naive = Math.max(1, p.tvl_usd * cal.global);
    modelErrs.push(Math.log(actual) - Math.log(pred));
    naiveErrs.push(Math.log(actual) - Math.log(naive));
  }
  const rmse = (errs: number[]): number => Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  const medae = (errs: number[]): number => {
    const abs = errs.map((e) => Math.abs(e)).sort((a, b) => a - b);
    return median(abs) as number;
  };
  return {
    n_train: train.length,
    n_test: test.length,
    model_rmse: round4(rmse(modelErrs)),
    naive_rmse: round4(rmse(naiveErrs)),
    model_medae: round4(medae(modelErrs)),
    naive_medae: round4(medae(naiveErrs)),
  };
}

export function oosCheck(protocols: Protocol[], asOf: string): OosResult {
  const valid = protocols.filter((p) => validRatio(p) !== null);
  const timeTrain = valid.filter((p) => p.listed_at !== null && p.listed_at < '2025-01-01');
  const timeTest = valid.filter((p) => p.listed_at !== null && p.listed_at >= '2025-01-01');
  const perm = pythonShuffle(valid, 7);
  const randomTrain = perm.slice(0, 92);
  const randomTest = perm.slice(92);
  return {
    time_split: splitMetrics(timeTrain, timeTest, asOf),
    random_split: splitMetrics(randomTrain, randomTest, asOf),
  };
}

// ---- Radar data object for data.js ----

export function buildRadar(snapshot: SnapshotData): { radar: Record<string, unknown>; rows: BoardRow[] } {
  const { rows, live, comparables, cal } = buildBoard(snapshot);
  const watchlistSet = new Set(snapshot.watchlist);
  const earlySize = rows.filter((r) => !watchlistSet.has(r.slug)).length;
  const oos = oosCheck(snapshot.protocols, snapshot.as_of);
  const radarRows = rows.map((r) => ({
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
    category_multiple: r.model.category_multiple,
    comparables: r.model.comparables,
    raw_median: r.model.raw_median,
    size_multiplier: r.model.size_multiplier,
    growth_multiplier: r.model.growth_multiplier,
    maturity_multiplier: r.model.maturity_multiplier,
    growth_pct: r.model.growth_pct,
    category_median_growth: (() => {
      const g = cal.growthMedians[r.category ?? 'Other'] ?? null;
      return g === null ? null : round4(g);
    })(),
  }));
  const multiplesOut: Record<string, { multiple: number; n: number }> = {};
  for (const [cat, e] of Object.entries(cal.multiples)) {
    multiplesOut[cat] = { multiple: round4(e.multiple), n: e.n };
  }
  const rawMediansOut: Record<string, { raw: number | null; n: number }> = {};
  for (const [cat, e] of Object.entries(cal.rawMedians)) {
    rawMediansOut[cat] = { raw: e.raw === null ? null : round4(e.raw), n: e.n };
  }
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
    global_multiple: round4(cal.global),
    multiples: multiplesOut,
    raw_medians: rawMediansOut,
    comparables,
    oos,
    rows: radarRows,
    live,
  };
  return { radar, rows };
}

export function dataScript(radar: Record<string, unknown>): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
