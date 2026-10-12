import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../db.js';
import { modelConfig } from '../model/config.js';
import { analyseStock } from '../services/brain.js';
import { simulateRun } from '../services/simulation.js';
import { assureRun } from '../services/assurance.js';
import { reportRun, runDeclaration } from '../services/reports.js';

function withDatabase(callback) {
  // No import-time production connection; fixtures and runs stay in memory.
  const db = openDatabase(':memory:');
  try { return callback(db); } finally { db.close(); }
}

function assertAssurance(db, runId) {
  const assurance = assureRun(db, runId);
  assert.equal(assurance.daysRetained, 60);
  assert.equal(assurance.status, 'PASS', JSON.stringify(assurance.checks));
}

test('stockouts do not suppress observed demand; expiry and horizon limits still apply', () => {
  const product = {
    product_id: 'SHORT', popularity_weight: 3, perishable: 1,
    shelf_life_days: 2, purchase_cost_cents: 200, selling_price_cents: 400,
  };
  const sales = new Map([['SHORT', [0, 0, 0, 0, 0, 0, 0]]]);
  const requests = new Map([['SHORT', [10, 10, 10, 10, 10, 10, 10]]]);
  const batches = new Map([['SHORT', [
    { remaining: 4, received: 7, expires: 8 },
  ]]]);
  const [review] = analyseStock([product], batches, sales, requests, modelConfig, 7);
  assert.equal(review.estimate, 11);
  assert.equal(review.demandEvidence.requestedMean, 10);
  assert.equal(review.demandEvidence.soldMean, 0);
  assert.equal(review.usableTomorrow, 0, 'tomorrow-expiring units cannot cover tomorrow');
  assert.equal(review.target, 11, 'two-day shelf life limits target to one day of cover');
  assert.equal(review.desired, 11);

  const [lastDay] = analyseStock([product], new Map(), sales, requests, modelConfig, 60);
  assert.equal(lastDay.desired, 0, 'no Day 61 order');
  const noRequests = new Map([['SHORT', Array(7).fill(0)]]);
  const [quiet] = analyseStock([product], new Map(), sales, noRequests, modelConfig, 7);
  assert.equal(quiet.estimate, 0.25, 'zero-demand days stay in the observation window');
});

test('60 days without customers exercise slow-mover responses without inventing sales', () => withDatabase((db) => {
  const run = simulateRun(db, {
    name: 'Isolated slow-mover scenario', seed: 101,
    weekdayCustomers: 0, weekendCustomers: 0,
  });
  assertAssurance(db, run.run_id);
  const report = reportRun(db, run.run_id);
  assert.equal(report.summary.customer_count, 0);
  assert.equal(report.summary.transaction_count, 0);
  assert.ok(report.eventCounts.slow_mover > 0);
  assert.equal(report.eventCounts.cash_constraint, 0);
  assert.deepEqual(report.availabilityCases, []);
  const events = db.prepare(`SELECT day, action, evidence_json FROM brain_events
    WHERE run_id = ? AND event_type = 'slow_mover'`).all(run.run_id);
  assert.ok(events.every((event) => event.day >= 14));
  assert.ok(events.every((event) => event.action.includes('Reduced future target cover')));
  assert.ok(events.every((event) => JSON.parse(event.evidence_json).salesLast14Days === 0));

  const product = { product_id: 'SLOW', perishable: 0, popularity_weight: 1 };
  const [review] = analyseStock([product], new Map([['SLOW', [
    { remaining: 5, received: 1, expires: null },
  ]]]), new Map([['SLOW', Array(14).fill(0)]]),
  new Map([['SLOW', Array(14).fill(3)]]), modelConfig, 14);
  assert.equal(review.slow, true);
  assert.equal(review.target, 10, 'slow-mover cover is reduced to three days');
  assert.equal(review.desired, 5, 'lower target changes the replenishment quantity');
}));

test('expensive stock exercises reduced and deferred orders within A$15,000 cash', () => withDatabase((db) => {
  // Deliberately artificial verification fixture, not a proposed retail catalogue.
  db.exec('DELETE FROM products');
  db.prepare(`INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    'CASH', 'High-cost verification item', 'pantry', '1 unit',
    900000, 900000, 0, 0, null, 5,
  );
  db.prepare(`INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    'DEFER', 'Second high-cost verification item', 'household', '1 unit',
    900000, 900000, 0, 0, null, 5,
  );
  const run = simulateRun(db, {
    name: 'Isolated cash-constraint scenario', seed: 202,
    weekdayCustomers: 20, weekendCustomers: 20,
  });
  assertAssurance(db, run.run_id);
  const report = reportRun(db, run.run_id);
  assert.ok(report.eventCounts.cash_constraint > 0);
  const events = db.prepare(`SELECT evidence_json FROM brain_events
    WHERE run_id = ? AND event_type = 'cash_constraint'`).all(run.run_id)
    .map((event) => JSON.parse(event.evidence_json));
  assert.ok(events.some((event) => event.orderedUnits > 0 && event.orderedUnits < event.desiredUnits));
  assert.ok(events.some((event) => event.orderedUnits === 0), 'unaffordable orders are deferred');
  const orders = db.prepare('SELECT * FROM replenishment_orders WHERE run_id = ?').all(run.run_id);
  assert.ok(orders.length > 0);
  for (const order of orders) {
    assert.ok(order.total_cost_cents <= order.cash_before_cents);
    assert.equal(order.cash_after_cents, order.cash_before_cents - order.total_cost_cents);
    assert.equal(order.arrival_day, order.ordered_day + 1);
    assert.ok(order.ordered_day < 60);
  }
  assert.equal(run.opening_cash_cents, 1500000);
  assert.equal(run.opening_inventory_cost_cents, 0);
  assert.ok(report.availabilityCases.length > 0);
  assert.ok(report.availabilityCases.some((product) => product.days.some((day) =>
    day.desired_units > 0 && day.ordered_units === 0 && day.action.toLowerCase().includes('deferred'))));
  assert.equal(report.availabilityCases[0].days.at(-1).next_received_units, null);
}));

test('demand estimates and availability report reconcile to retained requests and receipts', () => withDatabase((db) => {
  const run = simulateRun(db, { name: 'Demand verification', seed: 303 });
  assertAssurance(db, run.run_id);
  const model = runDeclaration(db, run.run_id);
  assert.equal(model.configuration.brain.demandBasis, 'requested_units');
  assert.equal(run.engine_version, '1.1.0');
  const report = reportRun(db, run.run_id);
  assert.ok(report.availabilityCases.length > 0);
  for (const product of report.availabilityCases) {
    assert.equal(product.days.length, 60);
    assert.equal(product.days.reduce((sum, day) => sum + day.unmet_units, 0), product.unmet_units);
    assert.equal(product.days.reduce((sum, day) => sum + day.requested_units, 0), product.requested_units);
    for (const day of product.days) {
      const window = product.days.slice(Math.max(0, day.day - 7), day.day);
      const mean = window.reduce((sum, row) => sum + row.requested_units, 0) / window.length;
      assert.ok(Math.abs(day.demand_estimate - Math.max(0.25, mean * 1.1)) < 1e-10);
      const received = db.prepare(`SELECT COALESCE(SUM(quantity_delta), 0) AS units
        FROM inventory_movements WHERE run_id = ? AND product_id = ?
        AND day = ? AND movement_type = 'receipt'`).get(run.run_id, product.product_id, day.day + 1).units;
      assert.equal(day.next_received_units, day.day === 60 ? null : received);
    }
  }
  assert.match(report.findings[0].diagnosis, /recorded requests/);
  const before = db.prepare('SELECT COUNT(*) AS n FROM daily_records WHERE run_id = ?').get(run.run_id).n;
  assert.throws(() => db.prepare('UPDATE daily_records SET revenue_cents = 1 WHERE run_id = ?').run(run.run_id), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM brain_events WHERE run_id = ?').run(run.run_id), /append-only/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_records WHERE run_id = ?').get(run.run_id).n, before);
}));
