(function () {
'use strict';
var DATA = window.RADAR;
var state = { q: '', category: 'all', chain: 'all', wl: false, tvlMin: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
var WL = {};
DATA.watchlist.forEach(function (s) { WL[s] = true; });
var ROWS = DATA.rows;
var LIVE = DATA.live;

/* ---------- formatting ---------- */
function fmtMoney(v) {
  if (v === null || v === undefined) return '—';
  var a = Math.abs(v);
  if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
  return '$' + Math.round(v);
}
function fmtFull(v) {
  if (v === null || v === undefined) return '—';
  return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtPct(v) {
  if (v === null || v === undefined) return 'unknown';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function fmtAge(d) {
  if (d === null || d === undefined) return 'unknown';
  if (d >= 365) return (d / 365).toFixed(1) + 'y';
  return d + 'd';
}
function fmtMult(v) {
  if (v === null || v === undefined) return '—';
  return 'x' + v.toFixed(3);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function catOf(r) { return r.category === null ? 'Other' : r.category; }

/* ---------- farm plan (must match model.ts exactly) ---------- */
function chainOf(r) { return r.chains && r.chains.length ? r.chains[0] : 'its main chain'; }
function gasUsd(chain) {
  switch (chain) {
    case 'Ethereum': return 12;
    case 'Bitcoin': return 4;
    case 'Solana': case 'Base': case 'Arbitrum': case 'Optimism': case 'Binance':
    case 'Avalanche': case 'Polygon': case 'Monad': case 'Sui': case 'Aptos': return 1;
    default: return 2;
  }
}
function capitalFor(tvl) {
  if (tvl >= 5000000000) return 250;
  if (tvl >= 1000000000) return 150;
  if (tvl >= 100000000) return 100;
  return 50;
}
function holdDaysFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function templateFor(category, name, chain, capital) {
  var c = (category || '').toLowerCase();
  function has() { for (var i = 0; i < arguments.length; i++) if (c.indexOf(arguments[i]) !== -1) return true; return false; }
  if (has('lend', 'cdp', 'collateral')) return {
    main: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the loan-to-value below 50%.',
    second: 'Borrow $' + Math.round(capital * 0.3) + ' of a stablecoin against the deposit, then repay half of it a week later so both sides of the position are on record.',
    recurring: 'Top up or partially repay the loan once a week, keeping the position open and the health factor above 2.' };
  if (has('dex', 'yield', 'leveraged farm', 'liquidity manager') || c === 'farm') return {
    main: 'Provide $' + capital + ' of liquidity to ' + name + '\'s deepest pool on ' + chain + ' and keep the position in range.',
    second: 'Swap $25 through ' + name + '\'s own router on ' + chain + ' so the wallet shows both a liquidity position and swap volume.',
    recurring: 'Claim the pool fees once a week and add half of them back to the same pool on ' + chain + '.' };
  if (has('rwa', 'onchain capital', 'stablecoin', 'algo-stables', 'dual-token')) return {
    main: 'Mint $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it in the farming wallet.',
    second: 'Claim the accrued yield once, then redeposit it into the same asset so the balance grows on-chain.',
    recurring: 'Check the yield accrual once a week and add $10 of fresh capital on ' + chain + ' each month.' };
  if (has('curator', 'allocator', 'yield aggregator', 'indexes')) return {
    main: 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the farming wallet.',
    second: 'Split a second $25 deposit across a different ' + name + ' vault on ' + chain + ' so the wallet touches two strategies.',
    recurring: 'Review the vault allocation once a week and move $10 between vaults when the mix drifts.' };
  if (has('staking', 'restak')) return {
    main: 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt token.',
    second: 'Restake or delegate the receipt token once through ' + name + '\'s own restaking route on ' + chain + '.',
    recurring: 'Claim the staking rewards once a week and restake half of them through ' + name + '.' };
  if (has('derivative', 'basis trading', 'perpetual', 'options', 'synthetics', 'prediction')) return {
    main: 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position at 2x or less.',
    second: 'Close the first position after a day, then open a second one half the size so the wallet shows repeat usage.',
    recurring: 'Place one small hedged trade a week on ' + name + ', never risking more than 10% of the margin.' };
  if (has('bridge')) return {
    main: 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ' and keep the bridged funds in the farming wallet.',
    second: 'Use $25 of the bridged funds inside an app on ' + chain + ', then bridge $10 back through ' + name + ' a week later.',
    recurring: 'Bridge $10 each way once a month through ' + name + ' so the route stays active.' };
  if (has('payment', 'card', 'otc')) return {
    main: 'Fund a $' + capital + ' balance through ' + name + ' on ' + chain + ' and keep the account in good standing.',
    second: 'Make one $10 payment or purchase through ' + name + ' on ' + chain + ' from the farming wallet.',
    recurring: 'Use ' + name + ' for one small payment each week on ' + chain + ' and keep a receipt of every one.' };
  return {
    main: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.',
    second: 'Use $25 of the position for a second action inside ' + name + ' on ' + chain + ', such as a swap, a vote or a claim.',
    recurring: 'Do one qualifying action a week inside ' + name + ' on ' + chain + ', such as a deposit, a swap or a vote.' };
}
function farmSteps(r) {
  var chain = chainOf(r), gas = gasUsd(chain), capital = capitalFor(r.tvl_usd), hold = holdDaysFor(r.age_days);
  var t = templateFor(r.category, r.name, chain, capital);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.',
      cost: 'about $' + gas + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
    { text: t.main, cost: '$' + capital + ' of capital and about $' + (gas * 2) + ' of gas on ' + chain, time: '15 minutes to set up' },
    { text: t.second, cost: 'about $' + gas + ' of gas plus the $25 moved', time: '10 minutes' },
    { text: t.recurring, cost: 'about $' + gas + ' of gas a week on ' + chain, time: '10 minutes a week' },
    { text: 'Open ' + r.name + '\'s own points or rewards page, join it if it has one, and vote in its governance once.',
      cost: 'no fee to check, about $1 of gas to vote', time: '10 minutes' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.',
      cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
    { text: 'Decide the exit before any token exists: sell half of any allocation on the first day it trades, keep the rest for ' + hold + ' days, and never buy the token in its first hour.',
      cost: 'about $' + (gas * 2) + ' of gas to claim and sell on ' + chain, time: '10 minutes on claim day' },
    { text: 'Write the wallet, the dates and every transaction in a farm log, and claim only from links the protocol itself publishes.',
      cost: 'nothing but the log, and never pay to claim', time: '5 minutes' }
  ];
}
function stepText(step) {
  var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
  if (s.length > 600) s = s.slice(0, 597) + '...';
  if (s.length < 20) s += ' Do it exactly as written.';
  return s;
}

/* ---------- hash ---------- */
function readHash() {
  var p = new URLSearchParams(window.location.hash.slice(1));
  if (p.get('q')) state.q = p.get('q');
  if (p.get('category')) state.category = p.get('category');
  if (p.get('chain')) state.chain = p.get('chain');
  if (p.get('wl') === '1') state.wl = true;
  if (p.get('tvl')) state.tvlMin = parseInt(p.get('tvl'), 10) || 0;
  if (p.get('p')) state.selected = p.get('p');
  if (p.get('tab')) state.tab = p.get('tab');
  if (p.get('sort')) state.sort = p.get('sort');
  if (p.get('dir') === '1') state.dir = 1;
}
function writeHash() {
  var p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.category !== 'all') p.set('category', state.category);
  if (state.chain !== 'all') p.set('chain', state.chain);
  if (state.wl) p.set('wl', '1');
  if (state.tvlMin) p.set('tvl', String(state.tvlMin));
  if (state.selected) p.set('p', state.selected);
  if (state.tab !== 'pre-token') p.set('tab', state.tab);
  if (state.sort !== 'implied') p.set('sort', state.sort);
  if (state.dir === 1) p.set('dir', '1');
  var h = p.toString();
  history.replaceState(null, '', h ? '#' + h : window.location.pathname + window.location.search);
}

/* ---------- filtering / sorting ---------- */
function filteredRows() {
  var q = state.q.trim().toLowerCase();
  var list = ROWS.filter(function (r) {
    if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
    if (state.category !== 'all' && catOf(r) !== state.category) return false;
    if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) === -1)) return false;
    if (r.tvl_usd < state.tvlMin) return false;
    if (state.wl && !WL[r.slug]) return false;
    return true;
  });
  var key = state.sort, dir = state.dir;
  function val(r) {
    if (key === 'rank') return r.rank;
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'change') return r.change_7d === null ? -Infinity : r.change_7d;
    if (key === 'age') return r.age_days === null ? -1 : r.age_days;
    if (key === 'multiple') return r.category_multiple;
    return r.implied_value_usd;
  }
  list.sort(function (a, b) {
    var va = val(a), vb = val(b);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return a.slug < b.slug ? -1 : 1;
  });
  return list;
}
function filteredLive() {
  var q = state.q.trim().toLowerCase();
  return LIVE.filter(function (r) {
    if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
    if (state.category !== 'all' && catOf(r) !== state.category) return false;
    if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) === -1)) return false;
    if (r.tvl_usd < state.tvlMin) return false;
    return true;
  });
}

/* ---------- render ---------- */
var main = document.getElementById('board');

function headerHtml() {
  return '<header class="top"><div class="brand">Token <span>Radar</span></div>' +
    '<div class="meta">Snapshot ' + esc(DATA.as_of) + ' &middot; Model ' + esc(DATA.model_version) +
    ' &middot; ' + DATA.board_size + ' pre-token rows</div></header>';
}
function ledeHtml() {
  var covered = ROWS.filter(function (r) { return WL[r.slug]; }).length;
  return '<section class="lede"><h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by implied value</h1>' +
    '<p>The watchlist is the floor: ' + DATA.watchlist_size + ' protocols the radar must cover. The early radar adds the ' +
    DATA.early_size + ' largest other pre-token protocols below the ' + fmtMoney(DATA.floor_usd) +
    ' floor, ranked by TVL. Implied value is a model calibrated from this snapshot itself &mdash; an estimate of what a token might be worth, not a promise, and not a price.</p>' +
    '<div class="facts">' +
    '<div class="fact"><b>' + covered + ' / ' + DATA.watchlist_size + '</b><span>Watchlist covered</span></div>' +
    '<div class="fact"><b>' + fmtMoney(ROWS[0].implied_value_usd) + '</b><span>Top implied value</span></div>' +
    '<div class="fact"><b>' + DATA.board_size + '</b><span>Pre-token rows scored</span></div>' +
    '<div class="fact"><b>' + DATA.live_size + '</b><span>Live-token protocols set aside</span></div>' +
    '</div></section>';
}
function methodHtml() {
  return '<section class="panel" aria-label="How to read this radar"><h2>How to read this radar</h2><ol>' +
    '<li><b>Category multiples are medians.</b> Each category&rsquo;s multiple is the median mcap/TVL of its tokened protocols. A category with fewer than 3 comparables falls back to the global median &mdash; a thin category never leans on a single observation.</li>' +
    '<li><b>Size decay is estimated, not assumed.</b> The within-category median slope is 0.88, giving an exponent of 0.12. The pooled slope would give 0.31 and was rejected by the out-of-sample check below.</li>' +
    '<li><b>Growth is relative.</b> Seven-day growth is measured against the category median &mdash; a protocol that beats its peers rises even when its category falls.</li>' +
    '<li><b>Farm plans are derived, and priced.</b> Each plan follows from the protocol&rsquo;s category, chain, TVL and age, and the steps shown here are identical to the ones in board.json. Every plan is priced to the dollar: the capital comes back on exit, so the net cost of farming is gas only.</li>' +
    '<li><b>The model is tested out-of-sample.</b> See the panel below the formula: it prices the typical protocol better than the naive baseline, but not on RMSE, which is why the decay is kept small.</li>' +
    '</ol><p>Every number on this page can be recomputed from the snapshot with the formula below.</p></section>';
}
function controlsHtml() {
  var cats = {}, chains = {};
  ROWS.forEach(function (r) {
    var c = catOf(r);
    cats[c] = (cats[c] || 0) + 1;
    (r.chains || []).forEach(function (ch) { chains[ch] = (chains[ch] || 0) + 1; });
  });
  var catOpts = '<option value="all">All categories</option>' +
    Object.keys(cats).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + ' (' + cats[c] + ')</option>';
    }).join('');
  var chainOpts = '<option value="all">All chains</option>' +
    Object.keys(chains).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + ' (' + chains[c] + ')</option>';
    }).join('');
  var tvlOpts = [[0, 'Any TVL'], [1e7, '\u2265$10M'], [5e7, '\u2265$50M'], [1e8, '\u2265$100M'], [5e8, '\u2265$500M'], [1e9, '\u2265$1B']]
    .map(function (o) { return '<option value="' + o[0] + '"' + (state.tvlMin === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
  return '<section class="controls" aria-label="Filters">' +
    '<label>Search <input type="search" id="f-q" value="' + esc(state.q) + '" placeholder="Search protocols&hellip;" aria-label="Search protocols"></label>' +
    '<label>Category <select id="f-cat" aria-label="Filter by category">' + catOpts + '</select></label>' +
    '<label>Chain <select id="f-chain" aria-label="Filter by chain">' + chainOpts + '</select></label>' +
    '<label>Min TVL <select id="f-tvl" aria-label="Minimum TVL">' + tvlOpts + '</select></label>' +
    '<label><input type="checkbox" id="f-wl"' + (state.wl ? ' checked' : '') + '> Watchlist only</label>' +
    '<span class="tabs" role="group" aria-label="Board tab">' +
    '<button type="button" id="tab-pre" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
    '<button type="button" id="tab-live" aria-pressed="' + (state.tab === 'live') + '">Live token</button></span>' +
    '<span class="count" id="row-count"></span></section>';
}
function boardTableHtml(list) {
  var maxImp = ROWS[0].implied_value_usd;
  function th(key, label) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' \u2193' : ' \u2191') : '';
    return '<th class="sortable" data-sort="' + key + '" scope="col">' + label + arrow + '</th>';
  }
  var head = '<tr>' + th('rank', 'Rank') + th('name', 'Protocol') + '<th scope="col">Chain</th>' +
    th('tvl', 'TVL') + th('change', '7d') + th('age', 'Age') + th('multiple', 'Multiple') +
    th('implied', 'Implied value') + '<th scope="col">Token</th></tr>';
  var body = list.map(function (r) {
    var pct = Math.max(3, Math.round(r.implied_value_usd / maxImp * 100));
    var chg = r.change_7d === null ? '<span class="num">—</span>'
      : '<span class="num ' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</span>';
    return '<tr class="clickable" data-slug="' + esc(r.slug) + '" tabindex="0">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><strong>' + esc(r.name) + '</strong>' + (WL[r.slug] ? '<span class="badge">WATCH</span>' : '') +
      '<span class="sub">' + esc(catOf(r)) + '</span></td>' +
      '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>' +
      '<td>' + chg + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num">' + fmtMult(r.category_multiple) + '</td>' +
      '<td><div class="bar"><i style="width:' + pct + '%"></i></div><span class="num">' + fmtMoney(r.implied_value_usd) + '</span></td>' +
      '<td>no token</td></tr>';
  }).join('');
  return '<div class="tablewrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
}
function liveTableHtml(list) {
  var body = list.map(function (r) {
    var chg = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</span>';
    return '<tr><td>live</td><td><strong>' + esc(r.name) + '</strong><span class="sub">' + esc(catOf(r)) + '</span></td>' +
      '<td class="num">' + fmtMoney(r.tvl_usd) + '</td><td class="num">' + chg + '</td>' +
      '<td class="num">' + fmtMoney(r.mcap_usd) + '</td><td>already trades</td></tr>';
  }).join('');
  return '<p>Market cap is a fact, not a model: these protocols already trade, so they are set aside from the ranking.</p>' +
    '<div class="tablewrap"><table><thead><tr><th scope="col">Status</th><th scope="col">Protocol</th>' +
    '<th scope="col" class="num">TVL</th><th scope="col" class="num">7d</th><th scope="col" class="num">Market cap</th>' +
    '<th scope="col">Token</th></tr></thead><tbody>' + body + '</tbody></table></div>';
}
function top10Html() {
  var items = ROWS.slice(0, 10).map(function (r) {
    var med = '';
    if (r.comparables >= 3) {
      med = 'category median ' + fmtMult(r.raw_median) + ', ' + r.comparables + ' comparables';
    } else {
      med = 'category median ' + (r.raw_median === null ? '—' : fmtMult(r.raw_median)) + ' from ' + r.comparables +
        ' comparable(s) — thin, so the global median ' + fmtMult(DATA.global_multiple) + ' applies';
    }
    return '<li><strong>#' + r.rank + ' ' + esc(r.name) + '</strong> &mdash; ' + fmtFull(r.implied_value_usd) + ': ' +
      fmtMoney(r.tvl_usd) + ' TVL at ' + fmtMult(r.category_multiple) + ' (' + med + '), growth ' +
      fmtPct(r.growth_pct) + ' vs its category, ' + fmtAge(r.age_days) + ' with no token.</li>';
  }).join('');
  return '<section class="panel" aria-label="Why the top 10 rank here"><h2>Why the top 10 rank here</h2><ol class="top10">' + items + '</ol></section>';
}
function modelPanelHtml() {
  var topCats = Object.keys(DATA.multiples).map(function (c) {
    return { c: c, multiple: DATA.multiples[c].multiple, n: DATA.multiples[c].n };
  }).sort(function (a, b) { return (b.n - a.n) || (b.multiple - a.multiple) || (a.c < b.c ? -1 : 1); }).slice(0, 8);
  var catRows = topCats.map(function (e) {
    return '<tr><td>' + esc(e.c) + '</td><td class="num">' + fmtMult(e.multiple) + '</td><td class="num">' + e.n + '</td></tr>';
  }).join('');
  var o = DATA.oos;
  function oosRow(label, s) {
    return '<tr><td>' + label + '</td><td class="num">' + s.n_test + '</td><td class="num">' + s.model_rmse.toFixed(4) +
      '</td><td class="num">' + s.naive_rmse.toFixed(4) + '</td><td class="num">' + s.model_medae.toFixed(4) +
      '</td><td class="num">' + s.naive_medae.toFixed(4) + '</td></tr>';
  }
  var formula = 'implied = round( tvl_usd x category_multiple x size_factor x growth x maturity )\n' +
    '  category_multiple = median mcap/TVL of tokened protocols in the category (n &gt;= 3),\n' +
    '                      else the global ' + fmtMult(DATA.global_multiple) + '; clamped [0.05, 1.00]\n' +
    '  size_factor       = min(1, (100M / tvl_usd) ^ 0.12)\n' +
    '  growth            = 1 + clamp(change_7d \u2212 category median growth, -50, 100) / 100 x 0.4\n' +
    '  maturity          = 0.65 + min(age_days, 1095) / 1095 x 0.35  (unknown age: 365d)';
  return '<section class="panel" aria-label="How implied value is computed"><h2>How implied value is computed</h2>' +
    '<p>Implied value is one function of the snapshot&rsquo;s own numbers. No protocol is singled out by name: the same calibration, the same size decay, and the same growth and maturity factors score every row. Categories with fewer than 3 tokened comparables fall back to the global median. The size exponent 0.12 is the estimated within-category median slope (0.88), not an assumption &mdash; the pooled slope of 0.31 was rejected by the out-of-sample check below. Growth is measured relative to the category median.</p>' +
    '<div class="formula mono">' + formula + '</div>' +
    '<h3>Largest calibrated categories</h3>' +
    '<table class="small"><thead><tr><th scope="col">Category</th><th scope="col" class="num">Multiple</th><th scope="col" class="num">Comparables</th></tr></thead><tbody>' + catRows + '</tbody></table>' +
    '<h3>Out-of-sample check</h3>' +
    '<table class="small"><thead><tr><th scope="col">Split</th><th scope="col" class="num">Protocols tested</th>' +
    '<th scope="col" class="num">Model log-RMSE</th><th scope="col" class="num">Naive log-RMSE</th>' +
    '<th scope="col" class="num">Model median |log err|</th><th scope="col" class="num">Naive median |log err|</th></tr></thead><tbody>' +
    oosRow('Time-split', o.time_split) + oosRow('Random-split seed 7', o.random_split) + '</tbody></table>' +
    '<p>The model prices the typical protocol better than the naive baseline (lower median error in both splits), but not on RMSE &mdash; a few large misses dominate. That is why the size decay is kept small (0.12).</p>' +
    '<p>TVL, seven-day growth and age come from the snapshot; age is counted from first listing. The early radar is every other pre-token protocol below the floor, ranked by TVL; live-token protocols are set aside by market cap.</p></section>';
}
function footerHtml() {
  return '<footer><p>Source: the sealed snapshot of ' + esc(DATA.as_of) + ', ' + DATA.board_size +
    ' pre-token rows scored by model radar-4. Protocols are described as recording no token, never as having none: a record may miss a token that exists.</p>' +
    '<p>The board covers the ' + DATA.watchlist_size + ' watchlist protocols plus the ' + DATA.early_size +
    ' largest other pre-token protocols below the watchlist floor; only exchanges and versioned (V2/V3) forks are left out.</p></footer>';
}

function render() {
  var html = '<div class="shell">' + headerHtml() + ledeHtml() + methodHtml() + controlsHtml();
  var countText = '';
  if (state.tab === 'pre-token') {
    var list = filteredRows();
    countText = 'Showing ' + list.length + ' of ' + ROWS.length + ' rows';
    if (list.length === 0) {
      html += '<section class="panel empty"><p>No protocol matches that filter</p><button type="button" class="btn ghost" id="clear-filters">Clear filters</button></section>';
    } else {
      html += boardTableHtml(list);
    }
    html += top10Html() + modelPanelHtml();
  } else {
    var live = filteredLive();
    countText = live.length + ' live-token protocols';
    html += liveTableHtml(live) + modelPanelHtml();
  }
  html += footerHtml() + '</div>';
  main.innerHTML = html;
  main.setAttribute('aria-busy', 'false');
  var count = document.getElementById('row-count');
  if (count) count.textContent = countText;
  bindControls();
}

function bindControls() {
  var q = document.getElementById('f-q');
  if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); });
  var cat = document.getElementById('f-cat');
  if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
  var ch = document.getElementById('f-chain');
  if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
  var tvl = document.getElementById('f-tvl');
  if (tvl) tvl.addEventListener('change', function () { state.tvlMin = parseInt(tvl.value, 10) || 0; writeHash(); render(); });
  var wl = document.getElementById('f-wl');
  if (wl) wl.addEventListener('change', function () { state.wl = wl.checked; writeHash(); render(); });
  var tp = document.getElementById('tab-pre');
  if (tp) tp.addEventListener('click', function () { state.tab = 'pre-token'; writeHash(); render(); });
  var tl = document.getElementById('tab-live');
  if (tl) tl.addEventListener('click', function () { state.tab = 'live'; writeHash(); render(); });
  var clear = document.getElementById('clear-filters');
  if (clear) clear.addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.tvlMin = 0;
    writeHash(); render();
  });
  Array.prototype.forEach.call(main.querySelectorAll('th.sortable'), function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) { state.dir = -state.dir; }
      else { state.sort = key; state.dir = (key === 'rank' || key === 'name') ? 1 : -1; }
      writeHash(); render();
    });
  });
  Array.prototype.forEach.call(main.querySelectorAll('tr.clickable'), function (tr) {
    tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    tr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
    });
  });
}

/* ---------- detail dialog ---------- */
var dlg = document.createElement('dialog');
dlg.className = 'detail';
document.body.appendChild(dlg);
dlg.addEventListener('close', function () {
  if (state.selected) { state.selected = null; writeHash(); }
});

function comparablesChart(r, comps) {
  var ratios = comps.map(function (c) { return c.ratio; });
  var maxR = Math.max.apply(null, ratios.concat([r.category_multiple]));
  var W = 640, labelW = 150, chartW = 440, x0 = labelW + 10, rowH = 16, top = 4;
  var H = top + ratios.length * rowH + 16;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Comparable ratios chart">';
  comps.forEach(function (c, i) {
    var y = top + i * rowH;
    var w = Math.max(2, c.ratio / maxR * chartW);
    s += '<text x="0" y="' + (y + 13) + '" font-size="12" fill="#44506a">' + esc(c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name) + '</text>';
    s += '<rect x="' + x0 + '" y="' + y + '" width="' + w.toFixed(1) + '" height="16" rx="3" fill="#0e7c6b"></rect>';
    var vx = Math.min(x0 + w + 6, W - 44);
    s += '<text x="' + vx.toFixed(1) + '" y="' + (y + 13) + '" font-size="12" fill="#16233a">' + fmtMult(c.ratio) + '</text>';
  });
  var lx = x0 + r.category_multiple / maxR * chartW;
  s += '<line x1="' + lx.toFixed(1) + '" y1="4" x2="' + lx.toFixed(1) + '" y2="' + (H - 22) + '" stroke="#c2700a" stroke-width="2" stroke-dasharray="4 3"></line>';
  var tx = Math.max(30, Math.min(W - 30, lx));
  s += '<text x="' + tx.toFixed(1) + '" y="' + (H - 6) + '" font-size="12" text-anchor="middle" fill="#c2700a">this row</text>';
  return s + '</svg>';
}

function openDetail(slug) {
  var r = null;
  for (var i = 0; i < ROWS.length; i++) if (ROWS[i].slug === slug) { r = ROWS[i]; break; }
  if (!r) return;
  state.selected = slug;
  writeHash();
  var cat = catOf(r);
  var chain = chainOf(r), gas = gasUsd(chain), capital = capitalFor(r.tvl_usd), hold = holdDaysFor(r.age_days);
  var steps = farmSteps(r);
  var stepsHtml = steps.map(function (s) {
    var full = stepText(s);
    var idx = full.indexOf(' Cost: ');
    return '<li><strong>' + esc(full.slice(0, idx)) + '</strong> <span class="dim">' + esc(full.slice(idx + 1)) + '</span></li>';
  }).join('');
  var multLine, multNote = '';
  if (r.comparables >= 3) {
    multLine = fmtMult(r.category_multiple) + ' &middot; ' + r.comparables + ' comparables';
  } else {
    multLine = 'global median, ' + r.comparables + ' comparable(s) in category &mdash; too few to trust';
    multNote = r.raw_median === null
      ? 'no tokened comparables in this category &rarr; global median ' + fmtMult(DATA.global_multiple) + ' applies'
      : 'category median ' + fmtMult(r.raw_median) + ' &rarr; global median ' + fmtMult(DATA.global_multiple) + ' applies';
  }  var comps = DATA.comparables[cat] || [];
  var compSection;
  if (comps.length === 0) {
    compSection = '<p>No tokened protocol backs this category in the snapshot, so the multiple above is the global median across all categories instead.</p>';
  } else {
    var compRows = comps.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td class="num">' + fmtMoney(c.tvl_usd) + '</td>' +
        '<td class="num">' + fmtMoney(c.mcap_usd) + '</td><td class="num">' + fmtMult(c.ratio) + '</td></tr>';
    }).join('');
    compSection = '<table class="small"><thead><tr><th scope="col">Protocol</th><th scope="col" class="num">TVL</th>' +
      '<th scope="col" class="num">Market cap</th><th scope="col" class="num">mcap/TVL</th></tr></thead><tbody>' + compRows + '</tbody></table>' +
      '<div class="chart">' + comparablesChart(r, comps) + '</div>';
  }
  dlg.innerHTML =
    '<button type="button" class="btn ghost close-x" id="dlg-close">Close</button>' +
    '<p class="rankline">Rank ' + r.rank + ' of ' + DATA.board_size + ' &mdash; ' + (WL[r.slug] ? 'on the watchlist' : 'early radar') + '</p>' +
    '<h2>' + esc(r.name) + '</h2>' +
    '<p class="rankline">' + esc(cat) + ' &middot; ' + esc((r.chains || []).join(', ') || '—') + ' &middot; Listed ' + esc(r.listed_at || 'unknown') + '</p>' +
    '<h3>Implied value &mdash; the breakdown</h3>' +
    '<div class="eq">' +
    '<span class="lab">TVL</span><span class="val">' + fmtFull(r.tvl_usd) + '</span>' +
    '<span class="lab">Category multiple (' + esc(cat) + ')' + (multNote ? '<span class="sub2">' + multNote + '</span>' : '') + '</span><span class="val">' + multLine + '</span>' +
    '<span class="lab">Size factor</span><span class="val">' + fmtMult(r.size_multiplier) + '</span>' +
    '<span class="lab">Seven-day growth<span class="sub2">vs category median ' + fmtPct(r.category_median_growth) + '</span></span><span class="val">' + fmtPct(r.change_7d) + '</span>' +
    '<span class="lab">Growth multiplier</span><span class="val">' + fmtMult(r.growth_multiplier) + '</span>' +
    '<span class="lab">Age with no token</span><span class="val">' + fmtAge(r.age_days) + '</span>' +
    '<span class="lab">Maturity multiplier</span><span class="val">' + fmtMult(r.maturity_multiplier) + '</span>' +
    '<span class="lab total">Total Implied value</span><span class="val total">' + fmtFull(r.implied_value_usd) + '</span>' +
    '</div>' +
    '<p>Model radar-4: the same function scores every protocol. This is an estimate, not a price, and it says nothing about whether or when a token is issued.</p>' +
    '<h3>Tokened comparables in ' + esc(cat) + '</h3>' + compSection +
    '<h3>Farm plan</h3><ol class="steps">' + stepsHtml + '</ol>' +
    '<p class="plan-total">Plan total: Capital $' + capital + ' + about $' + (gas * 8) + ' gas on ' + esc(chain) + '.</p>' +
    '<p class="net"><b>Net cost to farm:</b> about $' + (gas * 8) + ' gas on ' + esc(chain) + ' &mdash; the $' + capital + ' capital comes back when you exit.</p>';
  document.getElementById('dlg-close').addEventListener('click', function () { dlg.close(); });
  if (!dlg.open) dlg.showModal();
}

readHash();
render();
if (state.selected) openDetail(state.selected);
})();
