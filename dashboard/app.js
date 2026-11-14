// Token Launch Radar — page logic. All data comes from window.RADAR (radar-data.js);
// nothing is hardcoded here except the page structure.
(function () {
  var R = window.RADAR || { rows: [], watchlist: [], comparable_info: {} };
  var rows = R.rows || [];
  var watchSet = {};
  (R.watchlist || []).forEach(function (s) { watchSet[s] = true; });
  var compInfo = R.comparable_info || {};

  var state = { q: '', cat: '', watch: false, sort: 'implied', sel: null };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtInt(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtMoney(v) {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return 'n/a';
    return (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(1) + '%';
  }
  function fmtMult(v) { return '\u00d7' + v.toFixed(2); }
  function fmtAge(days) {
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'yr';
  }
  function fmtDate(iso) {
    if (!iso) return 'unknown';
    var parts = iso.split('-');
    if (parts.length < 3) return iso;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return parseInt(parts[2], 10) + ' ' + months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  }
  function basisText(r) {
    return r.comparables && r.comparables.length > 0
      ? 'n=' + r.comparables.length + ' comparables'
      : 'no tokened comparable in category \u2014 global median applies';
  }

  // ---- top-10 rationale panel ----
  function renderTop10() {
    var top = rows.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 10);
    $('top10').innerHTML = top.map(function (r) {
      return '<li><b>#' + r.rank + ' ' + esc(r.name) + '</b> \u2014 $' + fmtInt(r.implied_value_usd) +
        ' : $' + fmtInt(r.tvl_usd) + ' TVL at ' + fmtMult(r.category_multiple) +
        ' (' + basisText(r) + '), growth ' + fmtPct(r.growth_pct) +
        ' vs its category, ' + fmtAge(r.age_days) + ' with no token.</li>';
    }).join('');
  }

  // ---- board table ----
  function visibleRows() {
    var q = state.q.toLowerCase();
    var list = rows.filter(function (r) {
      if (state.watch && !watchSet[r.slug]) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var bySlug = function (a, b) { return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0; };
    if (state.sort === 'tvl') list.sort(function (a, b) { return b.tvl_usd - a.tvl_usd || bySlug(a, b); });
    else if (state.sort === 'growth') list.sort(function (a, b) {
      var av = a.change_7d === null ? -Infinity : a.change_7d;
      var bv = b.change_7d === null ? -Infinity : b.change_7d;
      return bv - av || bySlug(a, b);
    });
    else if (state.sort === 'age') list.sort(function (a, b) { return b.age_days - a.age_days || bySlug(a, b); });
    else list.sort(function (a, b) { return a.rank - b.rank; });
    return list;
  }

  function renderTable() {
    var list = visibleRows();
    $('rowCount').textContent = list.length + ' rows shown';
    if (list.length === 0) {
      $('rows').innerHTML = '<tr><td colspan="9" class="note">No protocols match the current filters.</td></tr>';
      return;
    }
    $('rows').innerHTML = list.map(function (r) {
      var cls = [];
      if (r.rank <= 3) cls.push('top3');
      if (state.sel === r.slug) cls.push('sel');
      return '<tr data-slug="' + esc(r.slug) + '"' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + '<small>' + esc(r.slug) + '</small></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td class="chains">' + esc(r.chains.join(', ')) + '</td>' +
        '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtMoney(r.implied_value_usd) + '</td>' +
        '<td class="num">' + fmtMult(r.category_multiple) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td></tr>';
    }).join('');
  }

  // ---- detail view ----
  var SVGNS = 'http' + '://www.w3.org/2000/svg';
  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function textEl(name, attrs, text) {
    var n = el(name, attrs);
    n.textContent = text;
    return n;
  }

  function buildChart(r, comps) {
    var ratios = comps.map(function (c) { return c.mcap_usd / c.tvl_usd; });
    var maxV = Math.max.apply(null, ratios.concat([r.category_multiple]));
    if (!(maxV > 0)) return null;
    var W = 460, labelX = 0, barX = 150, barW = 260, barH = 16, gap = 34, top = 30;
    var H = top + comps.length * gap + 22;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' });
    var lineX = barX + (r.category_multiple / maxV) * barW;
    var labelX = Math.min(Math.max(lineX, 34), W - 34);
    svg.appendChild(textEl('text', { x: labelX, y: 12, 'text-anchor': 'middle', fill: '#e6e8eb', 'font-size': 11 }, 'this row'));
    svg.appendChild(el('line', { x1: lineX, y1: 20, x2: lineX, y2: top + comps.length * gap - 6, stroke: '#e6e8eb', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
    comps.forEach(function (c, i) {
      var y = top + i * gap;
      var w = Math.max(2, (ratios[i] / maxV) * barW);
      svg.appendChild(textEl('text', { x: labelX, y: y + 12, fill: '#e6e8eb', 'font-size': 11 }, c.name.length > 20 ? c.name.slice(0, 19) + '\u2026' : c.name));
      svg.appendChild(el('rect', { x: barX, y: y, width: w, height: barH, rx: 2, fill: '#4f8cff' }));
      svg.appendChild(textEl('text', { x: barX + w + 6, y: y + 12, fill: '#9aa3b2', 'font-size': 11 }, fmtMult(ratios[i])));
    });
    svg.appendChild(textEl('text', { x: 0, y: H - 4, fill: '#9aa3b2', 'font-size': 11 }, 'Bars: each comparable\u2019s mcap/TVL. Dashed line: this row\u2019s multiple.'));
    return svg;
  }

  function renderDetail(r) {
    var d = $('detail');
    var comps = (r.comparables || []).map(function (s) {
      var info = compInfo[s];
      return info ? { slug: s, name: info.name, tvl_usd: info.tvl_usd, mcap_usd: info.mcap_usd } : null;
    }).filter(Boolean);
    var catMed = r.category_median_growth === null
      ? 'category median n/a'
      : 'vs category median ' + fmtPct(r.category_median_growth);
    var compHtml;
    if (comps.length === 0) {
      compHtml = '<p class="note">No tokened comparable in this category \u2014 the global median applies.</p>';
    } else {
      var tableHtml = '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap/TVL</th></tr></thead><tbody>' +
        comps.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td class="num">' + fmtMoney(c.tvl_usd) +
            '</td><td class="num">' + fmtMoney(c.mcap_usd) + '</td><td class="num">' + fmtMult(c.mcap_usd / c.tvl_usd) + '</td></tr>';
        }).join('') + '</tbody></table>';
      compHtml = '<div class="comp">' + tableHtml + '<div class="chart" id="chart"></div></div>';
    }
    var catN = (R.multiples[r.category] || {}).n;
    var medianLine = '';
    if (comps.length > 0 && r.raw_median !== null && r.winsor_median !== null) {
      medianLine = '<p class="note">Category median mcap/TVL: raw ' + fmtMult(r.raw_median) +
        ' \u2192 winsorized ' + fmtMult(r.winsor_median) + ' across ' + catN +
        ' tokened comparable' + (catN === 1 ? '' : 's') + '.</p>';
    }
    d.innerHTML =
      '<h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category) + ' &middot; ' + esc(r.chains.join(', ')) +
      ' &middot; Listed ' + fmtDate(r.listed_at) + ' &middot; ' + fmtAge(r.age_days) + ' with no token</p>' +
      '<p class="formula">' + fmtMoney(r.implied_value_usd) + ' = ' + fmtMoney(r.tvl_usd) + ' &times; ' +
      r.category_multiple.toFixed(2) + ' &times; ' + r.size_multiplier.toFixed(2) + ' &times; ' +
      r.growth_multiplier.toFixed(2) + ' &times; ' + r.maturity_multiplier.toFixed(2) + '</p>' +
      '<div class="grid">' +
      '<div class="cell"><div class="k">TVL</div><div class="v">' + fmtMoney(r.tvl_usd) + '</div><div class="s">$' + fmtInt(r.tvl_usd) + '</div></div>' +
      '<div class="cell"><div class="k">Implied value</div><div class="v">' + fmtMoney(r.implied_value_usd) + '</div><div class="s">$' + fmtInt(r.implied_value_usd) + '</div></div>' +
      '<div class="cell"><div class="k">Category multiple</div><div class="v">' + fmtMult(r.category_multiple) + '</div><div class="s">' + basisText(r) + '</div></div>' +
      '<div class="cell"><div class="k">Size</div><div class="v">' + r.size_multiplier.toFixed(2) + '</div><div class="s">min(1, (100M/TVL)^0.12)</div></div>' +
      '<div class="cell"><div class="k">Growth</div><div class="v">' + r.growth_multiplier.toFixed(2) + '</div><div class="s">' + fmtPct(r.growth_pct) + ' ' + catMed + '</div></div>' +
      '<div class="cell"><div class="k">Maturity</div><div class="v">' + r.maturity_multiplier.toFixed(2) + '</div><div class="s">' + fmtAge(r.age_days) + ' old</div></div>' +
      '</div>' +
      '<h3>Tokened comparables in ' + esc(r.category) + '</h3>' + medianLine + compHtml +
      '<h3>Farm plan</h3><ol class="plan">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="plan-total">' + esc(r.plan_total_text) + '</p>';
    d.hidden = false;
    if (comps.length > 0) {
      var chart = buildChart(r, comps);
      if (chart) $('chart').appendChild(chart);
    }
  }

  // ---- wiring ----
  function initCats() {
    var cats = [];
    rows.forEach(function (r) { if (cats.indexOf(r.category) < 0) cats.push(r.category); });
    cats.sort();
    $('catFilter').innerHTML = '<option value="">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
  }

  $('search').addEventListener('input', function (e) { state.q = e.target.value; renderTable(); });
  $('catFilter').addEventListener('change', function (e) { state.cat = e.target.value; renderTable(); });
  $('watchOnly').addEventListener('change', function (e) { state.watch = e.target.checked; renderTable(); });
  $('sortBy').addEventListener('change', function (e) { state.sort = e.target.value; renderTable(); });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    var found = null;
    rows.forEach(function (r) { if (r.slug === slug) found = r; });
    if (!found) return;
    state.sel = slug;
    renderTable();
    renderDetail(found);
  });

  $('rowTotal').textContent = rows.length + ' protocols';
  initCats();
  renderTop10();
  renderTable();
})();
