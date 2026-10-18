// Tiny test harness for budget-core.js. Run: node src/test-core.js
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

// Test the exact code that shipped: pull the inlined core out of the built page.
const pagePath = path.join(__dirname, '..', 'christmas-gift-budget', 'index.html');
let G;
if (fs.existsSync(pagePath)) {
  const html = fs.readFileSync(pagePath, 'utf8');
  const m = /<script id="core">([\s\S]*?)<\/script>/.exec(html);
  assert(m, 'core script block not found in built page');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(m[1], ctx);
  G = ctx.GiftBudget;
  console.log('testing core inlined in ' + path.relative(process.cwd(), pagePath));
} else {
  G = require('./budget-core.js');
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const total = (a) => a.reserve + a.plannedTotal + a.unassigned;

test('parseMoney handles common inputs', () => {
  assert.strictEqual(G.parseMoney('500'), 50000);
  assert.strictEqual(G.parseMoney('1,234.5'), 123450);
  assert.strictEqual(G.parseMoney('$40'), 4000);
  assert.strictEqual(G.parseMoney('12,50'), 1250);
  assert.strictEqual(G.parseMoney('0.07'), 7);
  assert.strictEqual(G.parseMoney(''), null);
  assert(Number.isNaN(G.parseMoney('abc')));
  assert(Number.isNaN(G.parseMoney('-5')));
  assert(Number.isNaN(G.parseMoney('1.234')));
});

test('three equal people split 100.00 exactly (cents mode)', () => {
  const a = G.allocate({ budgetCents: 10000, reservePct: 0, roundWhole: false,
    people: [{ id: 'a', priority: 2 }, { id: 'b', priority: 2 }, { id: 'c', priority: 2 }] });
  assert.strictEqual(sum(a.planned), 10000);
  assert.strictEqual(total(a), 10000);
  const v = [...Object.values(a.planned)].sort();
  assert.deepStrictEqual(v, [3333, 3333, 3334]);
});

test('priority weights 3:2:1 are respected', () => {
  const a = G.allocate({ budgetCents: 60000, reservePct: 0, roundWhole: true,
    people: [{ id: 'a', priority: 1 }, { id: 'b', priority: 2 }, { id: 'c', priority: 3 }] });
  assert.deepStrictEqual({ ...a.planned }, { a: 30000, b: 20000, c: 10000 });
});

test('whole-unit rounding: shares are whole and the total still matches', () => {
  const a = G.allocate({ budgetCents: 100099, reservePct: 10, roundWhole: true,
    people: [1, 2, 3, 1, 2, 3, 2].map((p, i) => ({ id: 'p' + i, priority: p })) });
  Object.values(a.planned).forEach((c) => assert.strictEqual(c % 100, 0, 'share not whole: ' + c));
  assert.strictEqual(total(a), 100099);
});

test('fixed amounts are kept and the rest is shared', () => {
  const a = G.allocate({ budgetCents: 50000, reservePct: 10, roundWhole: true,
    people: [{ id: 'a', priority: 1, fixedCents: 12000 }, { id: 'b', priority: 1 }, { id: 'c', priority: 3 }] });
  assert.strictEqual(a.planned.a, 12000);
  assert.strictEqual(a.reserve, 5000);
  assert.strictEqual(a.planned.b + a.planned.c, 33000);
  assert.strictEqual(total(a), 50000);
});

test('fixed amounts above the budget report the overage', () => {
  const a = G.allocate({ budgetCents: 10000, reservePct: 0, roundWhole: true,
    people: [{ id: 'a', priority: 1, fixedCents: 8000 }, { id: 'b', priority: 1, fixedCents: 5000 }, { id: 'c', priority: 2 }] });
  assert.strictEqual(a.overPlan, 3000);
  assert.strictEqual(a.planned.c, 0);
});

test('everyone fixed: the left-over is reported as unassigned', () => {
  const a = G.allocate({ budgetCents: 20000, reservePct: 0, roundWhole: true,
    people: [{ id: 'a', priority: 1, fixedCents: 5000 }] });
  assert.strictEqual(a.unassigned, 15000);
  assert.strictEqual(total(a), 20000);
});

test('randomised: allocation always sums to the budget', () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let t = 0; t < 5000; t++) {
    const n = 1 + Math.floor(rnd() * 25);
    const budget = Math.floor(rnd() * 500000);
    const people = [];
    let fixed = 0;
    for (let i = 0; i < n; i++) {
      const p = { id: 'x' + i, priority: 1 + Math.floor(rnd() * 3) };
      if (rnd() < 0.25) { p.fixedCents = Math.floor(rnd() * budget / n); fixed += p.fixedCents; }
      people.push(p);
    }
    const roundWhole = rnd() < 0.5;
    const a = G.allocate({ budgetCents: budget, reservePct: Math.floor(rnd() * 20), roundWhole, people });
    if (a.overPlan === 0) assert.strictEqual(total(a), budget, 'trial ' + t);
    Object.values(a.suggestions).forEach((c) => {
      assert(Number.isInteger(c) && c >= 0, 'bad share ' + c);
      if (roundWhole) assert.strictEqual(c % 100, 0);
    });
  }
});

test('summarize tracks spent and remaining', () => {
  const people = [
    { id: 'a', group: 'family', priority: 1, spentCents: 4500 },
    { id: 'b', group: 'work', priority: 3, spentCents: 0 }
  ];
  const a = G.allocate({ budgetCents: 20000, reservePct: 0, roundWhole: true, people });
  const s = G.summarize(people, a);
  assert.strictEqual(s.spentTotal, 4500);
  assert.strictEqual(s.leftInBudget, 15500);
  assert.strictEqual(s.perPerson.a.remaining, a.planned.a - 4500);
  assert.strictEqual(s.groups.family.count, 1);
});

test('CSV quoting and formula guard', () => {
  const csv = G.toCSV([['Name', 'Note'], ['Ann, Jr.', '=SUM(A1)'], ['Bo "B"', '-12.50']]);
  assert.strictEqual(csv, 'Name,Note\r\n"Ann, Jr.",\'=SUM(A1)\r\n"Bo ""B""",-12.50\r\n');
  assert.strictEqual(G.plainAmount(-1205), '-12.05');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
