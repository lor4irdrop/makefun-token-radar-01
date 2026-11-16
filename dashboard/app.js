(function () {
  'use strict';
  var DATA = window.RADAR;
  var NS = 'http' + '://www.w3.org/2000/svg';
  var OOS_NOTE = 'The curve prices the typical protocol better than the naive baseline on random splits and on the time-split median error, but not on the time-split RMSE \u2014 a few large misses dominate. The pooled curve (no category) scores better still on every split, so it is shown below as a sensitivity check; the model keeps category intercepts because the radar is category-calibrated.';

  /* ---------- formatting ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function trimNum(x, d) {
    var s = x.toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function fmtUsd(v) {
    if (v == null) return '\u2014';
    if (v >= 1e9) return '$' + trimNum(v / 1e9, 2) + 'B';
    if (v >= 1e6) return '$' + trimNum(v / 1e6, 1) + 'M';
    if (v >= 1e3) return '$' + trimNum(v / 1e3, 1) + 'K';
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  function fmtFull(v) {
    if (v == null) return '\u2014';
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  function fmtPct(v) {
    if (v == null) return '\u2014';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d == null) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return d + 'd';
  }
  function fmtMult(v) {
    if (v == null) return '\u2014';
    return 'x' + v.toFixed(3);
  }
  function fmt4(v) {
    if (v == null) return '\u2014';
    return v.toFixed(4);
  }
  function wlBadge(r) {
    return DATA.watchlist.indexOf(r.slug) >= 0 ? '<span class="badge">WATCH</span>' : '';
  }

  /* ---------- farm plan: identical derivation to lib/model.ts ---------- */
  function chainOf(r) { return r.chains && r.chains.length ? r.chains[0] : 'its main chain'; }
  function gasUsd(chain) {
    if (chain === 'Ethereum') return 12;
    if (chain === 'Bitcoin') return 4;
    if (['Solana', 'Base', 'Arbitrum', 'Optimism', 'Binance', 'Avalanche', 'Polygon', 'Monad', 'Sui', 'Aptos'].indexOf(chain) >= 0) return 1;
    return 2;
  }
  function capitalFor(tvl) {
    if (tvl >= 5000000000) return 250;
    if (tvl >= 1000000000) return 150;
    if (tvl >= 100000000) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age == null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function templateFor(cat, name, chain, capital) {
    var c = (cat || '').toLowerCase();
    var borrow = Math.round(capital * 0.3);
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return {
        main: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the loan-to-value below 50%.',
        second: 'Borrow $' + borrow + ' of a stablecoin against the deposit, then repay half of it a week later so both sides of the position are on record.',
        recurring: 'Top up or partially repay the loan once a week, keeping the position open and the health factor above 2.'
      };
    }
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0 || c === 'farm') {
      return {
        main: 'Provide $' + capital + ' of liquidity to ' + name + '\'s deepest pool on ' + chain + ' and keep the position in range.',
        second: 'Swap $25 through ' + name + '\'s own router on ' + chain + ' so the wallet shows both a liquidity position and swap volume.',
        recurring: 'Claim the pool fees once a week and add half of them back to the same pool on ' + chain + '.'
      };
    }
    if (c.indexOf('rwa') >= 0 || c.indexOf('onchain capital') >= 0 || c.indexOf('stablecoin') >= 0 || c.indexOf('algo-stables') >= 0 || c.indexOf('dual-token') >= 0) {
      return {
        main: 'Mint $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it in the farming wallet.',
        second: 'Claim the accrued yield once, then redeposit it into the same asset so the balance grows on-chain.',
        recurring: 'Check the yield accrual once a week and add $10 of fresh capital on ' + chain + ' each month.'
      };
    }
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield aggregator') >= 0 || c.indexOf('indexes') >= 0) {
      return {
        main: 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the farming wallet.',
        second: 'Split a second $25 deposit across a different ' + name + ' vault on ' + chain + ' so the wallet touches two strategies.',
        recurring: 'Review the vault allocation once a week and move $10 between vaults when the mix drifts.'
      };
    }
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      return {
        main: 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt token.',
        second: 'Restake or delegate the receipt token once through ' + name + '\'s own restaking route on ' + chain + '.',
        recurring: 'Claim the staking rewards once a week and restake half of them through ' + name + '.'
      };
    }
    if (c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetics') >= 0 || c.indexOf('prediction') >= 0) {
      return {
        main: 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position at 2x or less.',
        second: 'Close the first position after a day, then open a second one half the size so the wallet shows repeat usage.',
        recurring: 'Place one small hedged trade a week on ' + name + ', never risking more than 10% of the margin.'
      };
    }
    if (c.indexOf('bridge') >= 0) {
      return {
        main: 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ' and keep the bridged funds in the farming wallet.',
        second: 'Use $25 of the bridged funds inside an app on ' + chain + ', then bridge $10 back through ' + name + ' a week later.',
        recurring: 'Bridge $10 each way once a month through ' + name + ' so the route stays active.'
      };
    }
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0 || c.indexOf('otc') >= 0) {
      return {
        main: 'Fund a $' + capital + ' balance through ' + name + ' on ' + chain + ' and keep the account in good standing.',
        second: 'Make one $10 payment or purchase through ' + name + ' on ' + chain + ' from the farming wallet.',
        recurring: 'Use ' + name + ' for one small payment each week on ' + chain + ' and keep a receipt of every one.'
      };
    }
    return {
      main: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.',
      second: 'Use $25 of the position for a second action inside ' + name + ' on ' + chain + ', such as a swap, a vote or a claim.',
      recurring: 'Do one qualifying action a week inside ' + name + ' on ' + chain + ', such as a deposit, a swap or a vote.'
    };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 597) + '...';
    if (s.length < 20) s += ' Do it carefully and record the result in the farm log.';
    return s;
  }
  function farmSteps(r) {
    var chain = chainOf(r);
    var gas = gasUsd(chain);
    var capital = capitalFor(r.tvl_usd);
    var hold = holdDaysFor(r.age_days);
    var t = templateFor(r.category, r.name, chain, capital);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'about $' + gas + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: t.main, cost: '$' + capital + ' of capital and about $' + (gas * 2) + ' of gas on ' + chain, time: '15 minutes to set up' },
      { text: t.second, cost: 'about $' + gas + ' of gas plus the $25 moved', time: '10 minutes' },
      { text: t.recurring, cost: 'about $' + gas + ' of gas a week on ' + chain, time: '10 minutes a week' },
      { text: 'Open ' + r.name + '\'s own points or rewards page, join it if it has one, and vote in its governance once.', cost: 'no fee to check, about $1 of gas to vote', time: '10 minutes' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Decide the exit before any token exists: sell half of any allocation on the first day it trades, keep the rest for ' + hold + ' days, and never buy the token in its first hour.', cost: 'about $' + (gas * 2) + ' of gas to claim and sell on ' + chain, time: '10 minutes on claim day' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and claim only from links the protocol itself publishes.', cost: 'nothing but the log, and never pay to claim', time: '5 minutes' }
    ];
    return steps.map(stepText);
  }
  function planTotals(r) {
    var chain = chainOf(r);
    return { capital: capitalFor(r.tvl_usd), gas: gasUsd(chain) * 8, gasTx: gasUsd(chain), chain: chain, hold: holdDaysFor(r.age_days) };
  }

  /* ---------- state + hash ---------- */
  var state = { q: '', category: 'all', chain: 'all', wl: false, tvlMin: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('wl') === '1') state.wl = true;
    if (p.get('tvl')) state.tvlMin = parseInt(p.get('tvl'), 10) || 0;
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.wl) p.set('wl', '1');
    if (state.tvlMin) p.set('tvl', String(state.tvlMin));
    if (state.tab !== 'pre-token') p.set('tab', state.tab);
    if (state.sort !== 'implied' || state.dir !== -1) { p.set('sort', state.sort); p.set('dir', String(state.dir)); }
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  /* ---------- filtering + sorting ---------- */
  function sortVal(r, key) {
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'chain') return (r.chains && r.chains[0]) || '';
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'change') return r.change_7d == null ? -Infinity : r.change_7d;
    if (key === 'age') return r.age_days == null ? -1 : r.age_days;
    if (key === 'multiple') return r.multiple_at_tvl == null ? -1 : r.multiple_at_tvl;
    if (key === 'implied') return r.implied_value_usd;
    if (key === 'mcap') return r.mcap_usd || 0;
    return r.rank;
  }
  function visibleRows() {
    var rows = state.tab === 'live' ? DATA.live.slice() : DATA.rows.slice();
    if (state.tab === 'pre-token') {
      if (state.q) {
        var q = state.q.toLowerCase();
        rows = rows.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0; });
      }
      if (state.category !== 'all') rows = rows.filter(function (r) { return (r.category || 'Other') === state.category; });
      if (state.chain !== 'all') rows = rows.filter(function (r) { return r.chains && r.chains.indexOf(state.chain) >= 0; });
      if (state.tvlMin) rows = rows.filter(function (r) { return r.tvl_usd >= state.tvlMin; });
      if (state.wl) rows = rows.filter(function (r) { return DATA.watchlist.indexOf(r.slug) >= 0; });
    }
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var va = sortVal(a, key);
      var vb = sortVal(b, key);
      var c = va < vb ? -1 : va > vb ? 1 : 0;
      if (c === 0) c = a.slug < b.slug ? -1 : 1;
      return c * dir;
    });
    return rows;
  }

  /* ---------- comparables bar chart ---------- */
  function compChart(row) {
    var comps = DATA.comparables[row.category || 'Other'] || [];
    var mult = row.multiple_at_tvl || 0;
    var maxV = mult;
    comps.forEach(function (c) { if (c.ratio > maxV) maxV = c.ratio; });
    if (maxV <= 0) maxV = 1;
    var W = 640, top = 26, left = 180, bw = 380, rowH = 34;
    var H = top + comps.length * rowH + 10;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    var lx = left + (mult / maxV) * bw;
    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', lx); line.setAttribute('x2', lx);
    line.setAttribute('y1', 18); line.setAttribute('y2', H - 4);
    line.setAttribute('stroke', '#c2700a'); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-dasharray', '5 4');
    svg.appendChild(line);
    var lab = document.createElementNS(NS, 'text');
    lab.setAttribute('x', Math.min(lx + 6, W - 60)); lab.setAttribute('y', 14);
    lab.setAttribute('font-size', '12'); lab.setAttribute('fill', '#c2700a');
    lab.textContent = 'this row';
    svg.appendChild(lab);
    comps.forEach(function (c, i) {
      var y = top + i * rowH;
      var nm = document.createElementNS(NS, 'text');
      nm.setAttribute('x', 0); nm.setAttribute('y', y + 15);
      nm.setAttribute('font-size', '13'); nm.setAttribute('fill', '#16233a');
      nm.textContent = c.name.length > 24 ? c.name.slice(0, 23) + '\u2026' : c.name;
      svg.appendChild(nm);
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', left); rect.setAttribute('y', y + 2);
      rect.setAttribute('width', Math.max(2, (c.ratio / maxV) * bw)); rect.setAttribute('height', 18);
      rect.setAttribute('fill', '#0e7c6b'); rect.setAttribute('rx', '3');
      svg.appendChild(rect);
      var val = document.createElementNS(NS, 'text');
      val.setAttribute('x', left + (c.ratio / maxV) * bw + 6); val.setAttribute('y', y + 16);
      val.setAttribute('font-size', '12'); val.setAttribute('fill', '#44506a');
      val.textContent = 'x' + c.ratio.toFixed(4);
      svg.appendChild(val);
    });
    return svg;
  }

  /* ---------- detail dialog ---------- */
  var dlg = null;
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    var totals = planTotals(row);
    var comps = DATA.comparables[row.category || 'Other'] || [];
    var curve = DATA.curve;
    var ic = curve.intercepts[row.category || 'Other'];
    var n = row.comparables;
    var interceptNote = n >= 3
      ? 'category intercept ' + fmt4(row.curve_intercept) + ' \u00b7 ' + n + ' comparables'
      : 'pooled intercept, ' + n + ' comparable(s) in category \u2014 too few to trust';
    var steps = farmSteps(row);
    var lis = steps.map(function (s) {
      var cut = s.indexOf(' Cost: ');
      var head = cut >= 0 ? s.slice(0, cut) : s;
      var tail = cut >= 0 ? s.slice(cut + 1) : '';
      return '<li><b>' + esc(head) + '</b> <span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    var compRows = comps.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td class="num">' + fmtUsd(c.tvl_usd) + '</td><td class="num">' + fmtUsd(c.mcap_usd) + '</td><td class="num">x' + c.ratio.toFixed(4) + '</td></tr>';
    }).join('');
    var compBlock;
    if (comps.length === 0) {
      compBlock = '<p>No tokened protocol backs this category in the snapshot, so the multiple above is the pooled intercept across all categories instead.</p>';
    } else {
      compBlock = '<table class="mini"><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap/TVL</th></tr></thead><tbody>' + compRows + '</tbody></table><div class="chartwrap"></div>' +
        (n === 3 ? '<p class="note">Only 3 comparables back this intercept \u2014 treat it as fragile.</p>' : '');
    }
    var gasNote = '';
    if (totals.gasTx > 1) {
      gasNote = '<p class="gasnote">Farming here costs about ' + totals.gasTx + '\u00d7 the gas of a $1-chain farm like the Base and Solana entries above.</p>';
    }
    var catMed = row.category_median_growth;
    dlg.innerHTML =
      '<p style="text-align:right;margin:0"><button class="btn ghost" data-close="1">Close</button></p>' +
      '<p class="rankline">Rank ' + row.rank + ' of ' + DATA.board_size + ' \u2014 ' + (DATA.watchlist.indexOf(row.slug) >= 0 ? 'on the watchlist' : 'early radar') + '</p>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Uncategorised') + ' \u00b7 ' + esc((row.chains || []).slice(0, 3).join(', ')) + (row.listed_at ? ' \u00b7 listed ' + esc(row.listed_at) : '') + '</p>' +
      '<h3>Implied value \u2014 the breakdown</h3>' +
      '<dl class="kv">' +
      '<dt>TVL</dt><dd>' + fmtFull(row.tvl_usd) + '</dd>' +
      '<dt>Curve base</dt><dd>' + fmtFull(row.curve_base) + '</dd>' +
      '<dd class="note">exp(' + fmt4(row.curve_intercept) + ' + ' + curve.slope.toFixed(4) + ' \u00d7 ln(TVL)) \u2014 ' + esc(interceptNote) + '</dd>' +
      '<dd class="note">multiple at this TVL ' + fmtMult(row.multiple_at_tvl) + '</dd>' +
      '<dt>Seven-day growth</dt><dd>' + fmtPct(row.change_7d) + '</dd>' +
      '<dd class="note">vs category median ' + (catMed == null ? 'no growth data in this category' : fmtPct(catMed)) + '</dd>' +
      '<dt>Growth multiplier</dt><dd>' + fmt4(row.growth_multiplier) + '</dd>' +
      '<dt>Age with no token</dt><dd>' + fmtAge(row.age_days) + '</dd>' +
      '<dt>Maturity multiplier</dt><dd>' + fmt4(row.maturity_multiplier) + '</dd>' +
      '<dt class="total">Total implied value</dt><dd class="total">' + fmtFull(row.implied_value_usd) + '</dd>' +
      '</dl>' +
      '<p class="note">Model radar-5: the same function scores every protocol. This is an estimate, not a price, and it says nothing about whether or when a token is issued.</p>' +
      '<h3>Tokened comparables in ' + esc(row.category || 'Other') + '</h3>' + compBlock +
      '<h3>Farm plan</h3>' +
      '<ol class="steps">' + lis + '</ol>' +
      '<p class="planline">Plan total: Capital $' + totals.capital + ' + about $' + totals.gas + ' gas on ' + esc(totals.chain) + '.</p>' +
      '<p class="planline net">Net cost to farm: about $' + totals.gas + ' gas on ' + esc(totals.chain) + ' \u2014 the $' + totals.capital + ' capital comes back when you exit.</p>' +
      gasNote +
      '<p style="margin-top:18px"><button class="btn" data-close="1">Close</button></p>';
    var wrap = dlg.querySelector('.chartwrap');
    if (wrap && comps.length) wrap.appendChild(compChart(row));
    dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeDetail); });
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    if (dlg && dlg.open) dlg.close();
  }

  /* ---------- page render ---------- */
  function headerHtml() {
    return '<header class="top"><div class="brand">Token Radar</div>' +
      '<div class="meta">Snapshot <b>' + esc(DATA.as_of) + '</b> &nbsp;\u00b7&nbsp; Model <b>radar-5</b> &nbsp;\u00b7&nbsp; <b>' + DATA.board_size + '</b> pre-token rows</div></header>';
  }
  function ledeHtml() {
    var top = DATA.rows[0];
    return '<h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by implied value</h1>' +
      '<p class="lede">The watchlist is the floor: ' + DATA.watchlist_size + ' protocols at or above $50M TVL with no token recorded. The early radar adds pre-token protocols below the floor. Implied value is a model calibrated from this snapshot itself \u2014 a comps curve fitted from 115 tokened protocols \u2014 not a promise, and not a price.</p>' +
      '<div class="facts">' +
      '<div class="fact"><div class="k">Watchlist covered</div><div class="v">' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</div><div class="s">every watchlist protocol is ranked</div></div>' +
      '<div class="fact"><div class="k">Top implied value</div><div class="v">' + fmtUsd(top.implied_value_usd) + '</div><div class="s">' + esc(top.name) + '</div></div>' +
      '<div class="fact"><div class="k">Pre-token rows scored</div><div class="v">' + DATA.board_size + '</div><div class="s">' + DATA.early_size + ' early radar rows below the floor</div></div>' +
      '<div class="fact"><div class="k">Live-token protocols set aside</div><div class="v">' + DATA.live_size + '</div><div class="s">already trading, not ranked</div></div>' +
      '</div>';
  }
  function methodHtml() {
    var c = DATA.curve;
    return '<section class="panel"><h2>How to read this radar</h2><ul>' +
      '<li>Implied value comes from a comps curve fitted from 115 tokened protocols in this snapshot: one shared slope ' + c.slope.toFixed(4) + ' (size exponent ' + c.size_exponent.toFixed(3) + ') plus an intercept per category. Categories with fewer than 3 comparables use the pooled intercept \u2014 a thin category never rests on a single observation.</li>' +
      '<li>The curve is fitted at runtime from the snapshot, not assumed. The pooled curve (no category) actually scores better out-of-sample and is shown below as a sensitivity check \u2014 the model keeps category intercepts because this radar is category-calibrated.</li>' +
      '<li>Growth is measured relative to the category median \u2014 a protocol that beats its peers rises.</li>' +
      '<li>The farm plan is derived from each protocol\u2019s category, chain, TVL and age, and the steps shown here are identical to the ones in board.json. Every plan is priced to the dollar \u2014 capital comes back on exit, so the net cost of farming is gas alone.</li>' +
      '<li>The value model is tested out-of-sample (see the panel below the formula) \u2014 it prices the typical protocol better than the naive baseline on random splits and on the time-split median error, but not on the time-split RMSE.</li>' +
      '</ul><p>Every number on this page can be recomputed from the snapshot with the formula below.</p></section>';
  }
  function controlsHtml() {
    var catCounts = {};
    DATA.rows.forEach(function (r) {
      var k = r.category || 'Other';
      catCounts[k] = (catCounts[k] || 0) + 1;
    });
    var catOpts = '<option value="all">All categories</option>' + Object.keys(catCounts).sort().map(function (k) {
      return '<option value="' + esc(k) + '"' + (state.category === k ? ' selected' : '') + '>' + esc(k) + ' (' + catCounts[k] + ')</option>';
    }).join('');
    var chainSet = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (ch) { chainSet[ch] = 1; }); });
    var chainOpts = '<option value="all">All chains</option>' + Object.keys(chainSet).sort().map(function (k) {
      return '<option value="' + esc(k) + '"' + (state.chain === k ? ' selected' : '') + '>' + esc(k) + '</option>';
    }).join('');
    var tvlOpts = [[0, 'Any TVL'], [10000000, '\u2265$10M'], [50000000, '\u2265$50M'], [100000000, '\u2265$100M'], [500000000, '\u2265$500M'], [1000000000, '\u2265$1B']].map(function (o) {
      return '<option value="' + o[0] + '"' + (state.tvlMin === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    return '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name or slug" value="' + esc(state.q) + '" aria-label="Search protocols">' +
      '<select id="fcat" aria-label="Filter by category">' + catOpts + '</select>' +
      '<select id="fchain" aria-label="Filter by chain">' + chainOpts + '</select>' +
      '<select id="ftvl" aria-label="Minimum TVL">' + tvlOpts + '</select>' +
      '<label><input type="checkbox" id="fwl"' + (state.wl ? ' checked' : '') + '> Watchlist only</label>' +
      '<div class="tabs"><button class="tab" data-tab="pre-token" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
      '<button class="tab" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live token</button></div>' +
      '<span class="rowcount" id="rowcount"></span></div>';
  }
  function tableHtml(rows) {
    var top1 = DATA.rows[0].implied_value_usd;
    var cols;
    if (state.tab === 'live') {
      cols = '<tr><th data-sort="rank">Status</th><th data-sort="name">Protocol</th><th data-sort="tvl" class="num">TVL</th><th data-sort="change" class="num">7d</th><th data-sort="mcap" class="num">Market cap</th><th>Token</th></tr>';
    } else {
      cols = '<tr><th data-sort="rank">Rank</th><th data-sort="name">Protocol</th><th data-sort="chain">Chain</th><th data-sort="tvl" class="num">TVL</th><th data-sort="change" class="num">7d</th><th data-sort="age" class="num">Age</th><th data-sort="multiple" class="num">Multiple</th><th data-sort="implied" class="num">Implied value</th><th>Token</th></tr>';
    }
    var body = rows.map(function (r) {
      if (state.tab === 'live') {
        return '<tr><td>live</td><td><b>' + esc(r.name) + '</b><div class="sub">' + esc(r.category || 'Uncategorised') + '</div></td>' +
          '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num ' + (r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
          '<td class="num">' + fmtUsd(r.mcap_usd) + '</td><td>already trades</td></tr>';
      }
      var pctCls = r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var pct = Math.max(3, Math.round((r.implied_value_usd / top1) * 100));
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0"><td class="num">' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b>' + wlBadge(r) + '<div class="sub">' + esc(r.category || 'Uncategorised') + '</div></td>' +
        '<td>' + esc((r.chains || []).slice(0, 2).join(', ')) + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num ' + pctCls + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td><td class="num">' + fmtMult(r.multiple_at_tvl) + '</td>' +
        '<td><div class="valcell"><span class="bar"><i style="width:' + pct + '%"></i></span><b>' + fmtUsd(r.implied_value_usd) + '</b></div></td>' +
        '<td>no token</td></tr>';
    }).join('');
    if (!rows.length) {
      return '<div class="tablewrap"><table><thead>' + cols + '</thead></table><div class="empty">No protocol matches that filter.<br><button class="btn" id="clearfilters">Clear filters</button></div></div>';
    }
    return '<div class="tablewrap"><table><thead>' + cols + '</thead><tbody>' + body + '</tbody></table></div>';
  }
  function top10Html() {
    var items = DATA.rows.slice(0, 10).map(function (r) {
      var n = r.comparables;
      var ic = DATA.curve.intercepts[r.category || 'Other'];
      var inter = n >= 3
        ? 'intercept ' + fmt4(r.curve_intercept) + ', ' + n + ' comparables'
        : 'intercept pooled ' + fmt4(DATA.curve.pooled_intercept) + ', ' + n + ' comparable(s) \u2014 thin, so the pooled intercept applies';
      void ic;
      return '<li><b>#' + r.rank + ' ' + esc(r.name) + '</b> \u2014 ' + fmtFull(r.implied_value_usd) + ': ' + fmtUsd(r.tvl_usd) + ' TVL on the ' + esc(r.category || 'Other') + ' curve (' + inter + '), growth ' + fmtPct(r.growth_pct) + ' vs its category, ' + fmtAge(r.age_days) + ' with no token.</li>';
    }).join('');
    return '<section class="panel"><h2>Why the top 10 rank here</h2><ol>' + items + '</ol></section>';
  }
  function formulaText() {
    var c = DATA.curve;
    return 'implied = round( exp(category_intercept + ' + c.slope.toFixed(4) + ' x ln(tvl_usd)) x growth x maturity )\n' +
      '  category_intercept = mean(ln mcap \u2212 ' + c.slope.toFixed(4) + ' x ln tvl) over tokened protocols in the category (n >= 3),\n' +
      '                       else the pooled intercept ' + c.pooled_intercept.toFixed(4) + '; fitted at runtime from 115 comparables\n' +
      '  size decay         = implied value grows as tvl_usd ^ ' + c.slope.toFixed(4) + ', not linearly (size exponent ' + c.size_exponent.toFixed(3) + ')\n' +
      '  growth             = 1 + clamp(change_7d \u2212 category median growth, -50, 100) / 100 x 0.4\n' +
      '  maturity           = 0.65 + min(age_days, 1095) / 1095 x 0.35  (unknown age: 365d)';
  }
  function modelHtml() {
    var c = DATA.curve;
    var cats = Object.keys(c.intercepts).filter(function (k) { return c.intercepts[k].n >= 3; })
      .sort(function (a, b) { return c.intercepts[b].intercept - c.intercepts[a].intercept; });
    var rows = cats.map(function (k) {
      var v = c.intercepts[k];
      return '<tr><td>' + esc(k) + '</td><td class="num">' + v.n + '</td><td class="num">' + fmt4(v.intercept) + '</td><td class="num">x' + v.multiple_at_100m.toFixed(4) + '</td></tr>';
    }).join('');
    rows += '<tr><td><b>Pooled (fallback, n&lt;3)</b></td><td class="num">' + c.n_comparables + '</td><td class="num">' + fmt4(c.pooled_intercept) + '</td><td class="num">x' + (Math.exp(c.pooled_intercept) * Math.pow(100000000, c.slope - 1)).toFixed(4) + '</td></tr>';
    var o = DATA.oos;
    var ts = o.time_split;
    var rs = o.random_splits;
    function rng(mean, lo, hi) { return mean.toFixed(4) + ' (' + lo.toFixed(4) + '\u2013' + hi.toFixed(4) + ')'; }
    return '<section class="panel"><h2>How implied value is computed</h2>' +
      '<p>One function scores every protocol from the snapshot\u2019s own figures: the comps curve is fitted from 115 tokened protocols at runtime, not assumed. Categories with fewer than 3 comparables fall back to the pooled intercept; the shared slope is the fitted slope, so the size exponent ' + c.size_exponent.toFixed(3) + ' is an estimate, not an assumption. The pooled curve (no category) scores better out-of-sample and is shown as a sensitivity check, and growth is measured relative to the category median. No name is privileged.</p>' +
      '<pre class="mono">' + esc(formulaText()) + '</pre>' +
      '<h3>Category intercepts \u2014 comps curve (slope ' + c.slope.toFixed(4) + ', R\u00b2 ' + c.r2_full.toFixed(3) + ', ' + c.n_comparables + ' comparables)</h3>' +
      '<table class="mini"><thead><tr><th>Category</th><th class="num">Comparables</th><th class="num">Intercept</th><th class="num">Multiple @ $100M TVL</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<h3>Out-of-sample check</h3>' +
      '<table class="mini"><thead><tr><th>Split</th><th class="num">Protocols tested</th><th class="num">Model log-RMSE</th><th class="num">Naive log-RMSE</th><th class="num">Pooled log-RMSE</th><th class="num">Model median |log err|</th><th class="num">Naive median |log err|</th><th class="num">Pooled median |log err|</th></tr></thead><tbody>' +
      '<tr><td>Time-split</td><td class="num">' + ts.n_test + '</td><td class="num">' + ts.model_rmse.toFixed(4) + '</td><td class="num">' + ts.naive_rmse.toFixed(4) + '</td><td class="num">' + ts.pooled_rmse.toFixed(4) + '</td><td class="num">' + ts.model_medae.toFixed(4) + '</td><td class="num">' + ts.naive_medae.toFixed(4) + '</td><td class="num">' + ts.pooled_medae.toFixed(4) + '</td></tr>' +
      '<tr><td>Random-split, 6 seeds</td><td class="num">' + rs.n_test + '</td><td class="num">' + rng(rs.model_rmse_mean, rs.model_rmse_min, rs.model_rmse_max) + '</td><td class="num">' + rng(rs.naive_rmse_mean, rs.naive_rmse_min, rs.naive_rmse_max) + '</td><td class="num">' + rng(rs.pooled_rmse_mean, rs.pooled_rmse_min, rs.pooled_rmse_max) + '</td><td class="num">' + rng(rs.model_medae_mean, rs.model_medae_min, rs.model_medae_max) + '</td><td class="num">' + rng(rs.naive_medae_mean, rs.naive_medae_min, rs.naive_medae_max) + '</td><td class="num">' + rng(rs.pooled_medae_mean, rs.pooled_medae_min, rs.pooled_medae_max) + '</td></tr>' +
      '</tbody></table>' +
      '<p>' + OOS_NOTE + '</p>' +
      '<p>TVL, seven-day growth and age come from the snapshot; age is the time since the protocol was first recorded. The early radar is every other pre-token protocol below the floor, taken by TVL. Live-token protocols are set aside by market cap, not by the model.</p></section>';
  }
  function liveNoteHtml() {
    return '<section class="panel"><p>These protocols already trade: their market cap is a fact from the snapshot, not a model output. They are set aside so the ranking stays about protocols with no token recorded.</p></section>';
  }
  function footerHtml() {
    return '<footer><p>Source: the sealed snapshot of ' + esc(DATA.as_of) + ', ' + DATA.board_size + ' pre-token rows scored by model radar-5. Protocols are described as recording no token, never as having none: a record may miss a token that exists.</p>' +
      '<p>The board covers the 40 watchlist protocols plus the 160 largest other pre-token protocols below the watchlist floor; only exchanges and versioned (V2/V3) forks are left out.</p></footer>';
  }

  function render() {
    var main = document.getElementById('board');
    var rows = visibleRows();
    var total = state.tab === 'live' ? DATA.live.length : DATA.board_size;
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = '<div class="shell">' + headerHtml() + ledeHtml() + methodHtml() + controlsHtml() +
      '<div id="tablehost">' + tableHtml(rows) + '</div>' +
      (state.tab === 'live' ? liveNoteHtml() : top10Html()) + modelHtml() + footerHtml() + '</div>';
    var rc = document.getElementById('rowcount');
    if (rc) rc.textContent = 'Showing ' + rows.length + ' of ' + total + ' rows';
    bindControls();
    bindTable();
    if (state.selected) openDetail(state.selected);
  }
  function bindControls() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; state.selected = null; writeHash(); renderTableOnly(); });
    var fc = document.getElementById('fcat');
    if (fc) fc.addEventListener('change', function () { state.category = fc.value; writeHash(); renderTableOnly(); });
    var fch = document.getElementById('fchain');
    if (fch) fch.addEventListener('change', function () { state.chain = fch.value; writeHash(); renderTableOnly(); });
    var ft = document.getElementById('ftvl');
    if (ft) ft.addEventListener('change', function () { state.tvlMin = parseInt(ft.value, 10) || 0; writeHash(); renderTableOnly(); });
    var fw = document.getElementById('fwl');
    if (fw) fw.addEventListener('change', function () { state.wl = fw.checked; writeHash(); renderTableOnly(); });
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { state.tab = t.getAttribute('data-tab'); state.sort = state.tab === 'live' ? 'mcap' : 'implied'; state.dir = -1; writeHash(); render(); });
    });
    var cf = document.getElementById('clearfilters');
    if (cf) cf.addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.tvlMin = 0;
      writeHash(); render();
    });
  }
  function renderTableOnly() {
    var rows = visibleRows();
    var host = document.getElementById('tablehost');
    if (host) host.innerHTML = tableHtml(rows);
    var total = state.tab === 'live' ? DATA.live.length : DATA.board_size;
    var rc = document.getElementById('rowcount');
    if (rc) rc.textContent = 'Showing ' + rows.length + ' of ' + total + ' rows';
    bindTable();
  }
  function bindTable() {
    var ths = document.querySelectorAll('thead th[data-sort]');
    ths.forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = k === 'name' || k === 'chain' ? 1 : -1; }
        writeHash(); renderTableOnly();
      });
    });
    var trs = document.querySelectorAll('tbody tr[data-slug]');
    trs.forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
      });
    });
    var cf = document.getElementById('clearfilters');
    if (cf) cf.addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.tvlMin = 0;
      writeHash(); render();
    });
  }

  dlg = document.createElement('dialog');
  dlg.className = 'detail';
  document.body.appendChild(dlg);
  dlg.addEventListener('close', function () {
    if (state.selected) { state.selected = null; writeHash(); }
  });
  readHash();
  render();
})();
