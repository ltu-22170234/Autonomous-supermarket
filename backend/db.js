import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import { seedProducts } from './services/catalogue.js';

export function openDatabase(
  databasePath = new URL(
    './database/supermarket.sqlite',
    import.meta.url
  )
) {
  const db = new DatabaseSync(databasePath);

  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA recursive_triggers = ON;
      PRAGMA busy_timeout = 5000;
    `);

    const schema = readFileSync(
      new URL('./database/init.sql', import.meta.url),
      'utf8'
    );

    db.exec(schema);

    const historyTables = [
      'run_configuration',
      'run_products',
      'customers',
      'demand_items',
      'transactions',
      'transaction_items',
      'inventory_batches',
      'inventory_movements',
      'replenishment_orders',
      'replenishment_items',
      'cash_movements',
      'brain_events',
      'daily_records',
      'daily_inventory',
    ];

    for (const table of historyTables) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS ${table}_no_update
        BEFORE UPDATE ON ${table}
        BEGIN
          SELECT RAISE(
            ABORT,
            'Simulation history is append-only.'
          );
        END;

        CREATE TRIGGER IF NOT EXISTS ${table}_no_delete
        BEFORE DELETE ON ${table}
        BEGIN
          SELECT RAISE(
            ABORT,
            'Simulation history is append-only.'
          );
        END;

        CREATE TRIGGER IF NOT EXISTS ${table}_running_only
        BEFORE INSERT ON ${table}

        WHEN COALESCE(
          (
            SELECT status
            FROM runs
            WHERE run_id = NEW.run_id
          ),
          'missing'
        ) != 'running'

        BEGIN
          SELECT RAISE(
            ABORT,
            'Completed run history is frozen.'
          );
        END;
      `);
    }

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS runs_frozen_config

      BEFORE UPDATE OF
        run_id,
        name,
        model_version,
        engine_version,
        start_date,
        simulation_days,
        opening_inventory_cost_cents,
        opening_cash_cents,
        created_at

      ON runs

      BEGIN
        SELECT RAISE(
          ABORT,
          'Run configuration is frozen.'
        );
      END;


      CREATE TRIGGER IF NOT EXISTS runs_no_delete
      BEFORE DELETE ON runs

      BEGIN
        SELECT RAISE(
          ABORT,
          'Runs cannot be deleted.'
        );
      END;


      CREATE TRIGGER IF NOT EXISTS runs_status_transition
      BEFORE UPDATE OF status ON runs

      WHEN OLD.status != 'running'
        OR NEW.status NOT IN ('completed', 'failed')

      BEGIN
        SELECT RAISE(
          ABORT,
          'Invalid run status transition.'
        );
      END;


      CREATE TRIGGER IF NOT EXISTS runs_completed_metadata
      BEFORE UPDATE OF completed_at, duration_ms ON runs

      WHEN OLD.status != 'running'

      BEGIN
        SELECT RAISE(
          ABORT,
          'Completed run metadata is frozen.'
        );
      END;
    `);

    const { count } = db.prepare(
      'SELECT COUNT(*) AS count FROM products'
    ).get();

    if (count === 0) {
      seedProducts(db);
    }

    const catalogue = db.prepare(
      'SELECT COUNT(*) AS count FROM products'
    ).get();

    console.log(
      `Product catalogue loaded: ${catalogue.count} products.`
    );

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

