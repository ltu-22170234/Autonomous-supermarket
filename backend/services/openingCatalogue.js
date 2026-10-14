import { createHash } from 'node:crypto';
import originalCatalogue from '../data/catalogue-v1.json' with { type: 'json' };
import { seedCatalogue } from '../data/catalogue.js';
import { modelConfig } from '../model/config.js';
import { clientError, openingCost, productColumns, validateCatalogue } from './catalogue.js';

const historyTables = [
  'runs', 'run_configuration', 'run_products', 'customers', 'demand_items',
  'transactions', 'transaction_items', 'inventory_batches', 'inventory_movements',
  'replenishment_orders', 'replenishment_items', 'cash_movements', 'brain_events',
  'daily_records', 'daily_inventory',
];

function savedHistoryFingerprint(db) {
  const hash = createHash('sha256');
  for (const table of historyTables) {
    hash.update(table);
    hash.update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  }
  return hash.digest('hex');
}

function sameCatalogue(left, right) {
  return left.length === right.length && left.every((product, index) =>
    productColumns.every((key) => product[key] === right[index][key])
  );
}

// Explicit, repeatable upgrade of the editable catalogue. Custom edits are guarded.
// Existing frozen runs and their submission designation are never rewritten.
export function updateOpeningCatalogue(db) {
  const products = validateCatalogue(seedCatalogue);
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT * FROM products ORDER BY product_id').all();
    const before = savedHistoryFingerprint(db);
    const alreadyUpdated = sameCatalogue(current, products);
    if (!alreadyUpdated && !sameCatalogue(current, originalCatalogue)) {
      throw clientError(
        'The catalogue has custom edits. Apply the reviewed costs and opening quantities through Catalogue; the automatic update has made no changes.',
        409
      );
    }

    if (!alreadyUpdated) {
      const update = db.prepare(`
        UPDATE products SET ${productColumns.slice(1).map((key) => `${key}=?`).join(',')}
        WHERE product_id=?
      `);
      for (const product of products) {
        update.run(...productColumns.slice(1).map((key) => product[key]), product.product_id);
      }
    }
    db.prepare(`
      INSERT INTO app_settings(key,value) VALUES ('catalogue_seeded',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(modelConfig.catalogue.seedVersion);

    const stored = validateCatalogue(db.prepare('SELECT * FROM products ORDER BY product_id').all());
    if (!sameCatalogue(stored, products) || savedHistoryFingerprint(db) !== before) {
      throw new Error('Opening catalogue update failed verification; changes rolled back.');
    }
    const result = {
      status: alreadyUpdated ? 'already current' : 'updated',
      products: products.length,
      previousOpeningCostCents: openingCost(current),
      openingCostCents: openingCost(stored),
      inventoryBudgetCents: modelConfig.finance.openingInventoryBudgetCents,
      operatingCashCents: modelConfig.finance.openingOperatingCashCents,
      historyUnchanged: true,
    };
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
