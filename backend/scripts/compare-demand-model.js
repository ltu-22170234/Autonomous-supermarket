import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openDatabase } from '../db.js';
import { productColumns } from '../services/catalogue.js';
import { simulateRun } from '../services/simulation.js';
import { assureRun } from '../services/assurance.js';
import { reportRun, runDeclaration } from '../services/reports.js';

// Run manually with `node backend/scripts/compare-demand-model.js`.
// Appends one candidate run; never replaces the Submitted Run or its history.
const db = openDatabase();
try {
  const baseline = db.prepare('SELECT * FROM runs WHERE is_submitted = 1').get();
  assert.ok(baseline, 'A Submitted Run is required for comparison.');
  const model = runDeclaration(db, baseline.run_id);
  const snapshot = db.prepare('SELECT * FROM run_products WHERE run_id = ? ORDER BY product_id').all(baseline.run_id);
  const catalogue = db.prepare('SELECT * FROM products ORDER BY product_id').all();
  const values = (products) => products.map((product) => productColumns.map((key) => product[key]));
  assert.deepEqual(values(catalogue), values(snapshot), 'Catalogue differs; a like-for-like demand comparison is not possible.');

  const tables = [
    'runs', 'run_configuration', 'run_products', 'customers', 'demand_items',
    'transactions', 'transaction_items', 'inventory_batches', 'inventory_movements',
    'replenishment_orders', 'replenishment_items', 'cash_movements', 'brain_events',
    'daily_records', 'daily_inventory',
  ];
  const fingerprint = () => {
    const hash = createHash('sha256');
    for (const table of tables) {
      hash.update(table);
      hash.update(JSON.stringify(db.prepare(`SELECT * FROM ${table} WHERE run_id = ? ORDER BY rowid`).all(baseline.run_id)));
    }
    return hash.digest('hex');
  };
  const before = fingerprint();
  const previous = reportRun(db, baseline.run_id);
  const baselineAssurance = assureRun(db, baseline.run_id);
  assert.equal(baselineAssurance.status, 'PASS');
  const candidate = simulateRun(db, {
    name: 'Demand-aware replenishment validation',
    startDate: baseline.start_date,
    seed: model.seed,
    weekdayCustomers: model.configuration.customers.basePerDay.weekday,
    weekendCustomers: model.configuration.customers.basePerDay.weekend,
  });
  const assurance = assureRun(db, candidate.run_id);
  assert.equal(assurance.status, 'PASS', JSON.stringify(assurance.checks));
  const updated = reportRun(db, candidate.run_id);
  assert.equal(updated.summary.intended_units, previous.summary.intended_units);
  assert.equal(updated.summary.customer_count, previous.summary.customer_count);
  assert.equal(fingerprint(), before, 'Baseline records changed.');

  const metrics = (report) => ({
    customers: report.summary.customer_count,
    requestedUnits: report.summary.intended_units,
    unmetUnits: report.summary.unmet_units,
    stockoutEvents: report.eventCounts.sold_out,
    writeOffAUD: report.summary.write_off_cents / 100,
    replenishmentAUD: report.summary.replenishment_spend_cents / 100,
    grossProfitAUD: report.summary.gross_profit_cents / 100,
    closingCashAUD: report.summary.closing_cash_cents / 100,
    sandwich: report.products.find((product) => product.product_id === 'P045'),
  });
  console.log(JSON.stringify({
    submittedRun: baseline.run_id,
    candidateRun: candidate.run_id,
    modelVersion: candidate.model_version,
    assurance: assurance.status,
    baselineUnchanged: true,
    baseline: metrics(previous),
    updated: metrics(updated),
  }, null, 2));
} finally {
  db.close();
}
