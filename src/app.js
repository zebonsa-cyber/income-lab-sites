/* Gift budget UI. Depends on window.GiftBudget (budget-core.js). */
(function () {
  'use strict';
  var G = window.GiftBudget;
  var KEY = 'zebonsa.giftBudget.v1';
  var GROUP_LABEL = { family: 'Family', friends: 'Friends', work: 'Work', kids: 'Kids', other: 'Other' };
  var FIELD_LABEL = { name: 'Name', group: 'Group', priority: 'Priority', fixed: 'Set amount', spent: 'Spent', idea: 'Gift idea' };
  var PRI_LABEL ={ 1: '1 – Top', 2: '2 – Middle', 3: '3 – Small' };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    tool: $('tool'), budget: $('budget'), budgetErr: $('budget-err'), currency: $('currency'),
    reserve: $('reserve'), round: $('round'), list: $('people'), empty: $('empty'),
    addForm: $('add-form'), addName: $('add-name'), addGroup: $('add-group'), addPri: $('add-pri'),
    addFixed: $('add-fixed'), addErr: $('add-err'), tpl: $('row-tpl'),
    sBudget: $('s-budget'), sPlanned: $('s-planned'), sSpent: $('s-spent'), sLeft: $('s-left'),
    sLeftL: $('s-left-l'), stLeft: $('st-left'), stPlanned: $('st-planned'), msg: $('s-msg'),
    bar: $('bar'), barL: $('bar-l'), barR: $('bar-r'),
    groupsSec: $('groups-sec'), groupsBody: $('groups-body'),
    gCount: $('g-count'), gPlanned: $('g-planned'), gSpent: $('g-spent'),
    storeNote: $('store-note'), announce: $('announce')
  };

  var state = defaults();
  var storageOK = true;

  function defaults() {
    return { v: 1, budget: null, currency: '$', reservePct: 10, roundWhole: true, people: [] };
  }

  /* ---------- storage (always guarded) ---------- */
  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object' || !Array.isArray(s.people)) return;
      var d = defaults();
      d.budget = G.isAmount(s.budget) ? s.budget : null;
      d.currency = ['$', '£', '€', ''].indexOf(s.currency) >= 0 ? s.currency : '$';
      d.reservePct = clampPct(s.reservePct);
      d.roundWhole = s.roundWhole !== false;
      d.people = s.people.filter(function (p) { return p && typeof p === 'object'; }).slice(0, 500).map(function (p) {
        return {
          id: String(p.id || newId()),
          name: String(p.name || '').slice(0, 60),
          group: GROUP_LABEL[p.group] ? p.group : 'other',
          priority: [1, 2, 3].indexOf(+p.priority) >= 0 ? +p.priority : 2,
          fixedCents: G.isAmount(p.fixedCents) ? p.fixedCents : null,
          spentCents: G.isAmount(p.spentCents) ? p.spentCents : null,
          idea: String(p.idea || '').slice(0, 120)
        };
      });
      state = d;
    } catch (e) { /* unreadable or blocked storage: start fresh */ }
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      if (!storageOK) { storageOK = true; el.storeNote.textContent = 'Saved automatically in this browser.'; }
    } catch (e) {
      if (storageOK) {
        storageOK = false;
        el.storeNote.textContent = 'This browser is not letting the page save (private mode or blocked storage). Use Export CSV to keep a copy.';
      }
    }
  }

  /* ---------- helpers ---------- */
  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clampPct(v) { v = Math.round(Number(v)); return isFinite(v) ? Math.min(50, Math.max(0, v)) : 10; }

  function fmt(c) {
    var neg = c < 0;
    c = Math.abs(Math.round(c));
    var whole = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var frac = c % 100;
    var s = state.currency + whole + (frac || !state.roundWhole ? '.' + ('0' + frac).slice(-2) : '');
    return neg ? '−' + s : s;
  }
  function plainInput(c) {
    if (!G.isAmount(c)) return '';
    return c % 100 ? G.plainAmount(c) : String(c / 100);
  }
  function say(text) {
    el.announce.textContent = '';
    window.setTimeout(function () { el.announce.textContent = text; }, 30);
  }
  function displayName(p, i) { return p.name.trim() || 'Person ' + (i + 1); }
  function moneyField(input, onValue) {
    var c = G.parseMoney(input.value);
    var bad = typeof c === 'number' && isNaN(c);
    input.setAttribute('aria-invalid', bad ? 'true' : 'false');
    onValue(bad ? null : c, bad);
  }

  /* ---------- rows ---------- */
  function buildRow(p) {
    var li = el.tpl.content.firstElementChild.cloneNode(true);
    li.dataset.id = p.id;
    li.querySelector('[data-f="name"]').value = p.name;
    li.querySelector('[data-f="group"]').value = p.group;
    li.querySelector('[data-f="priority"]').value = String(p.priority);
    li.querySelector('[data-f="fixed"]').value = plainInput(p.fixedCents);
    li.querySelector('[data-f="spent"]').value = plainInput(p.spentCents);
    li.querySelector('[data-f="idea"]').value = p.idea;
    return li;
  }

  function renderList() {
    el.list.textContent = '';
    state.people.forEach(function (p) { el.list.appendChild(buildRow(p)); });
    update();
  }

  function findPerson(id) {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === id) return i;
    return -1;
  }

  /* ---------- live outputs ---------- */
  function update() {
    var root = el.tool;
    root.style.setProperty('--cur', JSON.stringify(state.currency));
    root.classList.toggle('no-cur', state.currency === '');

    var budget = G.isAmount(state.budget) ? state.budget : 0;
    var a = G.allocate({ budgetCents: budget, reservePct: state.reservePct, roundWhole: state.roundWhole, people: state.people });
    var s = G.summarize(state.people, a);
    var has = state.people.length > 0;

    el.sBudget.textContent = G.isAmount(state.budget) ? fmt(budget) : '–';
    el.sPlanned.textContent = has ? fmt(a.plannedTotal) : '–';
    el.stPlanned.classList.toggle('is-over', a.overPlan > 0);
    el.sSpent.textContent = fmt(s.spentTotal);
    var over = s.leftInBudget < 0;
    el.sLeftL.textContent = over ? 'Over budget' : 'Left to spend';
    el.sLeft.textContent = fmt(Math.abs(s.leftInBudget));
    el.stLeft.classList.toggle('is-over', over);
    el.stLeft.classList.toggle('is-left', !over && budget > 0);

    var pctSpent = budget > 0 ? (s.spentTotal / budget) * 100 : (s.spentTotal > 0 ? 100 : 0);
    el.bar.querySelector('i').style.width = Math.min(100, pctSpent) + '%';
    el.bar.classList.toggle('over', pctSpent > 100);
    el.barL.textContent = 'Spent ' + Math.round(pctSpent) + '%';
    el.barR.textContent = 'Extras kept: ' + fmt(a.reserve);

    var m, cls = '';
    if (!G.isAmount(state.budget) || budget === 0) {
      m = has ? 'Enter your total budget above to see each person’s suggested amount.' : 'Enter your total budget to see suggested amounts.';
    } else if (!has) {
      m = 'Now add the people you are buying for. ' + fmt(a.reserve) + ' is set aside for extras.';
    } else if (a.overPlan > 0) {
      cls = 'over';
      m = 'Your set amounts are ' + fmt(a.overPlan) + ' more than the budget allows after extras. Lower a set amount, keep less for extras, or raise the budget.';
    } else if (over) {
      cls = 'over';
      m = 'You have spent ' + fmt(-s.leftInBudget) + ' more than your total budget.';
    } else if (a.unassigned > 0) {
      cls = 'ok';
      m = 'Everyone has a set amount. ' + fmt(a.unassigned) + ' of the budget is not assigned to anyone yet.';
    } else {
      cls = 'ok';
      var n = state.people.length;
      m = fmt(a.plannedTotal) + ' planned across ' + n + (n === 1 ? ' person' : ' people') + ', plus ' + fmt(a.reserve) + ' for extras. ' + fmt(s.stillToBuy) + ' still to buy.';
    }
    el.msg.textContent = m;
    el.msg.className = 'msg' + (cls ? ' ' + cls : '');

    // rows
    var rows = el.list.children;
    for (var r = 0; r < rows.length; r++) {
      var li = rows[r];
      var i = findPerson(li.dataset.id);
      if (i < 0) continue;
      var p = state.people[i];
      var pp = s.perPerson[p.id];
      var nm = displayName(p, i);
      li.querySelector('[data-act="del"]').setAttribute('aria-label', 'Remove ' + nm);
      li.setAttribute('aria-label', nm);
      // Contextual names; each starts with the visible label text (WCAG label-in-name).
      for (var f in FIELD_LABEL) {
        var inp = li.querySelector('[data-f="' + f + '"]');
        if (inp) inp.setAttribute('aria-label', f === 'name' ? 'Name, person ' + (i + 1) : FIELD_LABEL[f] + ' for ' + nm);
      }
      var plan = li.querySelector('.o-plan');
      plan.textContent = '';
      plan.appendChild(document.createTextNode('Planned '));
      var b = document.createElement('strong'); b.textContent = fmt(pp.planned); plan.appendChild(b);
      var em = document.createElement('em'); em.textContent = G.isAmount(p.fixedCents) ? ' set by you' : ' suggested'; plan.appendChild(em);
      var st = li.querySelector('.o-status');
      var stCls = '';
      var txt;
      if (pp.spent > pp.planned) { txt = 'Over by ' + fmt(pp.spent - pp.planned); stCls = 'over'; }
      else if (pp.spent === 0) { txt = pp.planned > 0 ? 'Not bought yet' : (budget ? 'No room left in budget' : 'Waiting for a budget'); }
      else if (pp.spent === pp.planned) { txt = 'Done, right on budget'; stCls = 'good'; }
      else { txt = 'Bought, ' + fmt(pp.planned - pp.spent) + ' under'; stCls = 'good'; }
      st.textContent = txt;
      st.className = 'o-status' + (stCls ? ' ' + stCls : '');
      li.classList.toggle('is-over', stCls === 'over');
    }

    el.empty.hidden = has;
    el.groupsSec.hidden = !has;
    renderGroups(s);
    renderPrint(a, s);
    save();
  }

  function cell(tag, text) { var c = document.createElement(tag); c.textContent = text; return c; }

  function renderGroups(s) {
    el.groupsBody.textContent = '';
    var count = 0;
    G.GROUPS.forEach(function (g) {
      var d = s.groups[g];
      if (!d.count) return;
      count += d.count;
      var tr = document.createElement('tr');
      var th = cell('th', GROUP_LABEL[g]); th.scope = 'row'; tr.appendChild(th);
      tr.appendChild(cell('td', String(d.count)));
      tr.appendChild(cell('td', fmt(d.planned)));
      tr.appendChild(cell('td', fmt(d.spent)));
      el.groupsBody.appendChild(tr);
    });
    var totPlanned = G.GROUPS.reduce(function (t, g) { return t + s.groups[g].planned; }, 0);
    el.gCount.textContent = String(count);
    el.gPlanned.textContent = fmt(totPlanned);
    el.gSpent.textContent = fmt(s.spentTotal);
  }

  function renderPrint(a, s) {
    var d = new Date();
    $('ps-meta').textContent = (state.people.length) + ' people · printed ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    var tot = $('ps-totals'); tot.textContent = '';
    [['Budget', a.budget], ['Extras kept', a.reserve], ['Planned gifts', a.plannedTotal], ['Spent', s.spentTotal], [s.leftInBudget < 0 ? 'Over budget' : 'Left to spend', Math.abs(s.leftInBudget)]]
      .forEach(function (x) {
        var div = document.createElement('div');
        div.appendChild(cell('span', x[0])); div.appendChild(cell('b', fmt(x[1])));
        tot.appendChild(div);
      });
    var body = $('ps-body'); body.textContent = '';
    state.people.forEach(function (p, i) {
      var pp = s.perPerson[p.id];
      var tr = document.createElement('tr');
      var box = cell('td', ''); box.className = 'box'; tr.appendChild(box);
      tr.appendChild(cell('td', displayName(p, i)));
      tr.appendChild(cell('td', GROUP_LABEL[p.group]));
      tr.appendChild(cell('td', String(p.priority)));
      tr.appendChild(cell('td', p.idea));
      [pp.planned, pp.spent, pp.remaining].forEach(function (v) { var c = cell('td', fmt(v)); c.className = 'n'; tr.appendChild(c); });
      body.appendChild(tr);
    });
    $('ps-planned').textContent = fmt(a.plannedTotal);
    $('ps-spent').textContent = fmt(s.spentTotal);
    $('ps-left').textContent = fmt(a.plannedTotal - s.spentTotal);
  }

  /* ---------- events ---------- */
  el.budget.addEventListener('input', function () {
    moneyField(el.budget, function (c, bad) {
      state.budget = c;
      el.budgetErr.textContent = bad ? 'Use numbers only, for example 750 or 750.50.' : '';
    });
    update();
  });
  el.budget.addEventListener('blur', function () {
    if (G.isAmount(state.budget)) el.budget.value = fmt(state.budget).replace(state.currency, '');
  });
  el.currency.addEventListener('change', function () { state.currency = el.currency.value; update(); });
  el.reserve.addEventListener('input', function () {
    state.reservePct = el.reserve.value === '' ? 0 : clampPct(el.reserve.value);
    update();
  });
  el.reserve.addEventListener('blur', function () { el.reserve.value = state.reservePct; });
  el.round.addEventListener('change', function () { state.roundWhole = el.round.checked; update(); });

  el.addForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = el.addName.value.trim();
    var fixed = G.parseMoney(el.addFixed.value);
    if (!name) {
      el.addErr.textContent = 'Please enter a name.';
      el.addName.setAttribute('aria-invalid', 'true');
      el.addName.focus();
      return;
    }
    if (typeof fixed === 'number' && isNaN(fixed)) {
      el.addErr.textContent = 'Set amount should be a number, or leave it blank.';
      el.addFixed.setAttribute('aria-invalid', 'true');
      el.addFixed.focus();
      return;
    }
    el.addErr.textContent = '';
    el.addName.setAttribute('aria-invalid', 'false');
    el.addFixed.setAttribute('aria-invalid', 'false');
    var p = { id: newId(), name: name, group: el.addGroup.value, priority: +el.addPri.value, fixedCents: fixed, spentCents: null, idea: '' };
    state.people.push(p);
    el.list.appendChild(buildRow(p));
    update();
    el.addName.value = '';
    el.addFixed.value = '';
    el.addName.focus();
    say('Added ' + name + '. ' + state.people.length + ' on your list.');
  });

  el.list.addEventListener('input', function (ev) {
    var t = ev.target, f = t.dataset.f;
    if (!f) return;
    var li = t.closest('li'); var i = findPerson(li.dataset.id);
    if (i < 0) return;
    var p = state.people[i];
    if (f === 'name') p.name = t.value.slice(0, 60);
    else if (f === 'idea') p.idea = t.value.slice(0, 120);
    else if (f === 'fixed') moneyField(t, function (c) { p.fixedCents = c; });
    else if (f === 'spent') moneyField(t, function (c) { p.spentCents = c; });
    update();
  });
  el.list.addEventListener('change', function (ev) {
    var t = ev.target, f = t.dataset.f;
    if (f !== 'group' && f !== 'priority') return;
    var i = findPerson(t.closest('li').dataset.id);
    if (i < 0) return;
    if (f === 'group') state.people[i].group = t.value;
    else state.people[i].priority = +t.value;
    update();
  });
  el.list.addEventListener('focusout', function (ev) {
    var t = ev.target, f = t.dataset.f;
    if (f !== 'fixed' && f !== 'spent') return;
    var i = findPerson(t.closest('li').dataset.id);
    if (i < 0) return;
    var v = f === 'fixed' ? state.people[i].fixedCents : state.people[i].spentCents;
    if (t.getAttribute('aria-invalid') !== 'true') t.value = plainInput(v);
  });
  el.list.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-act="del"]');
    if (!btn) return;
    var li = btn.closest('li');
    var i = findPerson(li.dataset.id);
    if (i < 0) return;
    var nm = displayName(state.people[i], i);
    state.people.splice(i, 1);
    var next = li.nextElementSibling || li.previousElementSibling;
    li.remove();
    update();
    (next ? next.querySelector('[data-f="name"]') : el.addName).focus();
    say('Removed ' + nm + '.');
  });

  $('load-example').addEventListener('click', function () {
    if (!G.isAmount(state.budget) || state.budget === 0) state.budget = 60000;
    [['Grandma Rose', 'family', 1, null], ['Dad', 'family', 1, null], ['Maya', 'kids', 1, null],
     ['Leo', 'kids', 2, null], ['Priya', 'friends', 2, null], ['Ben', 'friends', 3, null],
     ['Office gift swap', 'work', 3, 2500]].forEach(function (x) {
      state.people.push({ id: newId(), name: x[0], group: x[1], priority: x[2], fixedCents: x[3], spentCents: null, idea: '' });
    });
    syncSettings();
    renderList();
    el.list.querySelector('[data-f="name"]').focus();
    say('Example list loaded with ' + state.people.length + ' people.');
  });

  $('export').addEventListener('click', function () {
    var budget = G.isAmount(state.budget) ? state.budget : 0;
    var a = G.allocate({ budgetCents: budget, reservePct: state.reservePct, roundWhole: state.roundWhole, people: state.people });
    var s = G.summarize(state.people, a);
    var rows = [['Name', 'Group', 'Priority', 'Gift idea', 'Set amount', 'Planned', 'Spent', 'Left']];
    state.people.forEach(function (p, i) {
      var pp = s.perPerson[p.id];
      rows.push([displayName(p, i), GROUP_LABEL[p.group], p.priority, p.idea,
        G.isAmount(p.fixedCents) ? G.plainAmount(p.fixedCents) : '',
        G.plainAmount(pp.planned), G.plainAmount(pp.spent), G.plainAmount(pp.remaining)]);
    });
    rows.push([]);
    rows.push(['Budget', '', '', '', '', G.plainAmount(budget)]);
    rows.push(['Kept for extras (' + state.reservePct + '%)', '', '', '', '', G.plainAmount(a.reserve)]);
    rows.push(['Planned gifts', '', '', '', '', G.plainAmount(a.plannedTotal)]);
    rows.push(['Spent', '', '', '', '', '', G.plainAmount(s.spentTotal)]);
    rows.push(['Left in budget', '', '', '', '', '', '', G.plainAmount(s.leftInBudget)]);
    try {
      var blob = new Blob(['﻿' + G.toCSV(rows)], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'christmas-gift-budget.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      say('CSV file downloaded.');
    } catch (e) {
      say('Sorry, this browser could not create the file.');
    }
  });

  $('print').addEventListener('click', function () { update(); window.print(); });
  $('clear').addEventListener('click', function () {
    if (!window.confirm('Clear your budget and everyone on your list? This cannot be undone.')) return;
    state = defaults();
    syncSettings();
    renderList();
    el.budget.focus();
    say('Everything cleared.');
  });

  function syncSettings() {
    el.budget.value = G.isAmount(state.budget) ? fmt(state.budget).replace(state.currency, '') : '';
    el.currency.value = state.currency;
    el.reserve.value = state.reservePct;
    el.round.checked = state.roundWhole;
  }

  load();
  syncSettings();
  renderList();
})();
