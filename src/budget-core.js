/*
 * Gift budget core logic: pure functions, no DOM.
 * Inlined into christmas-gift-budget/index.html by src/build.py and
 * required directly by src/test-core.js under node.
 * All money is handled as integer cents to avoid floating-point drift.
 */
(function (root) {
  'use strict';

  // Priority 1 is the most important. Weights decide the share of the pool.
  var WEIGHTS = { 1: 3, 2: 2, 3: 1 };
  var GROUPS = ['family', 'friends', 'work', 'kids', 'other'];
  var MAX_CENTS = 100000000000; // 1,000,000,000.00, a sanity cap

  /**
   * Parse a typed amount into integer cents.
   * Returns null for an empty field and NaN for anything invalid.
   * Accepts "1,234.50", "1234.5", "$40", "12,50" (decimal comma).
   */
  function parseMoney(input) {
    if (input === null || input === undefined) return null;
    var s = String(input).replace(/[\s '$£€¥]/g, '');
    if (s === '') return null;
    if (/[^\d.,]/.test(s)) return NaN;
    if (s.indexOf('.') === -1 && /^\d+,\d{1,2}$/.test(s)) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
    var m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s);
    if (!m || (m[1] === '' && !m[2])) return NaN;
    var whole = m[1] === '' ? 0 : parseInt(m[1], 10);
    var frac = m[2] ? parseInt((m[2] + '00').slice(0, 2), 10) : 0;
    var cents = whole * 100 + frac;
    if (!isFinite(cents) || cents > MAX_CENTS) return NaN;
    return cents;
  }

  function isAmount(c) {
    return typeof c === 'number' && isFinite(c) && c >= 0;
  }

  function weightOf(priority) {
    return WEIGHTS[priority] || WEIGHTS[2];
  }

  /**
   * Split the budget.
   *   budget = reserve (extras) + fixed amounts + suggested amounts (+ unassigned)
   * People with a fixed amount keep it. Everyone else shares what is left,
   * weighted by priority, using the largest-remainder method so the shares
   * always add up exactly. With roundWhole, shares are whole currency units
   * and any odd cents go to the extras reserve.
   *
   * opts: { budgetCents, reservePct, roundWhole, people: [{ id, priority, fixedCents }] }
   */
  function allocate(opts) {
    var budget = isAmount(opts.budgetCents) ? Math.floor(opts.budgetCents) : 0;
    var unit = opts.roundWhole ? 100 : 1;
    var pct = Number(opts.reservePct);
    if (!isFinite(pct) || pct < 0) pct = 0;
    if (pct > 50) pct = 50;
    var people = opts.people || [];

    var reserve = Math.round((budget * pct) / 100 / unit) * unit;
    if (reserve > budget) reserve = budget;

    var fixedTotal = 0;
    var flex = [];
    people.forEach(function (p, i) {
      if (isAmount(p.fixedCents)) fixedTotal += p.fixedCents;
      else flex.push({ id: p.id, w: weightOf(p.priority), i: i });
    });

    var pool = budget - reserve - fixedTotal;
    var suggestions = {};
    var overPlan = 0;
    var unassigned = 0;

    if (pool < 0) {
      overPlan = -pool;
      flex.forEach(function (f) { suggestions[f.id] = 0; });
    } else if (flex.length === 0) {
      unassigned = pool;
    } else {
      var units = Math.floor(pool / unit);
      var leftover = pool - units * unit;
      var totalW = flex.reduce(function (t, f) { return t + f.w; }, 0);
      var given = 0;
      flex.forEach(function (f) {
        var num = units * f.w;
        f.base = Math.floor(num / totalW);
        f.rem = num - f.base * totalW;
        given += f.base;
      });
      var order = flex.slice().sort(function (a, b) {
        return b.rem - a.rem || b.w - a.w || a.i - b.i;
      });
      for (var k = 0; k < units - given; k++) order[k].base += 1;
      flex.forEach(function (f) { suggestions[f.id] = f.base * unit; });
      reserve += leftover; // sub-unit cents stay with extras so gifts stay round
    }

    var planned = {};
    var plannedTotal = 0;
    people.forEach(function (p) {
      var v = isAmount(p.fixedCents) ? p.fixedCents : suggestions[p.id] || 0;
      planned[p.id] = v;
      plannedTotal += v;
    });

    return {
      budget: budget,
      reserve: reserve,
      fixedTotal: fixedTotal,
      pool: Math.max(pool, 0),
      suggestions: suggestions,
      planned: planned,
      plannedTotal: plannedTotal,
      overPlan: overPlan,
      unassigned: unassigned,
      flexCount: flex.length
    };
  }

  /** Totals for spending, per person and per group. */
  function summarize(people, alloc) {
    var groups = {};
    GROUPS.forEach(function (g) { groups[g] = { count: 0, planned: 0, spent: 0 }; });
    var perPerson = {};
    var spentTotal = 0;
    var stillToBuy = 0;
    people.forEach(function (p) {
      var spent = isAmount(p.spentCents) ? p.spentCents : 0;
      var plan = alloc.planned[p.id] || 0;
      var g = groups[p.group] ? p.group : 'other';
      groups[g].count += 1;
      groups[g].planned += plan;
      groups[g].spent += spent;
      spentTotal += spent;
      if (plan > spent) stillToBuy += plan - spent;
      perPerson[p.id] = { planned: plan, spent: spent, remaining: plan - spent };
    });
    return {
      groups: groups,
      perPerson: perPerson,
      spentTotal: spentTotal,
      stillToBuy: stillToBuy,
      leftInBudget: alloc.budget - spentTotal
    };
  }

  /** cents -> "12.50" for spreadsheets (no symbol, dot decimal). */
  function plainAmount(c) {
    var neg = c < 0;
    c = Math.abs(Math.round(c));
    var s = Math.floor(c / 100) + '.' + ('0' + (c % 100)).slice(-2);
    return neg ? '-' + s : s;
  }

  /** Rows (arrays of strings/numbers) -> RFC 4180 CSV with formula guarding. */
  function toCSV(rows) {
    return rows.map(function (row) {
      return row.map(function (cell) {
        var s = cell === null || cell === undefined ? '' : String(cell);
        if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
        if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(',');
    }).join('\r\n') + '\r\n';
  }

  var api = {
    WEIGHTS: WEIGHTS,
    GROUPS: GROUPS,
    parseMoney: parseMoney,
    isAmount: isAmount,
    allocate: allocate,
    summarize: summarize,
    plainAmount: plainAmount,
    toCSV: toCSV
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GiftBudget = api;
})(this);
