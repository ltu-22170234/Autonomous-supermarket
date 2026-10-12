import { clientError } from './catalogue.js';
import { calendarDay } from './simulation.js';

export function getRun(db, id) {
  const run = db.prepare(
    'SELECT * FROM runs WHERE run_id = ?'
  ).get(id);

  if (!run) {
    throw clientError('Run not found.', 404);
  }

  return run;
}

function all(db, sql, id) {
  return db.prepare(sql).all(id);
}

function single(db, sql, id) {
  return db.prepare(sql).get(id);
}

export function assureRun(db, id) {
  const run = getRun(db, id);
  const checks = [];

  function check(name, failures, detail) {
    checks.push({
      name,
      status: failures.length ? 'FAIL' : 'PASS',
      detail,
      exceptionCount: failures.length,
      exceptions: failures.slice(0, 12),
    });
  }

  // 1. Check history completeness and opening finances.
  const tables = [
    'run_configuration',
    'run_products',
    'daily_records',
    'daily_inventory',
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
  ];

  const retained = Object.fromEntries(
    tables.map((table) => [
      table,
      single(
        db,
        `SELECT COUNT(*) AS n FROM ${table} WHERE run_id = ?`,
        id
      ).n,
    ])
  );

  const days = all(
    db,
    'SELECT * FROM daily_records WHERE run_id = ? ORDER BY day',
    id
  );

  const completeness = [];

  if (run.status !== 'completed') {
    completeness.push({
      issue: 'Run is not completed',
    });
  }

  if (
    retained.run_configuration !== 1 ||
    retained.run_products < 1
  ) {
    completeness.push({
      issue: 'Configuration or product snapshots missing',
    });
  }

  if (
    days.length !== 60 ||
    days.some(
      (day, index) =>
        day.day !== index + 1 ||
        day.calendar_date !==
          calendarDay(run.start_date, day.day)
            .toISOString()
            .slice(0, 10)
    )
  ) {
    completeness.push({
      issue: 'Expected consecutive Days 1–60 with correct dates',
      retainedDays: days.length,
    });
  }

  if (retained.daily_inventory !== 60 * retained.run_products) {
    completeness.push({
      issue: 'Daily product snapshots incomplete',
      expected: 60 * retained.run_products,
      actual: retained.daily_inventory,
    });
  }

  const snapshots = all(
    db,
    'SELECT * FROM run_products WHERE run_id = ? ORDER BY product_id',
    id
  );

  const openingCost = snapshots.reduce(
    (sum, product) =>
      sum +
      product.purchase_cost_cents * product.initial_quantity,
    0
  );

  if (
    openingCost !== run.opening_inventory_cost_cents ||
    openingCost > 4000000 ||
    run.opening_cash_cents !== 1500000
  ) {
    completeness.push({
      issue: 'Opening financial boundary mismatch',
      openingCost,
    });
  }

  const frozen = single(
    db,
    'SELECT * FROM run_configuration WHERE run_id = ?',
    id
  );

  if (frozen) {
    const cfg = JSON.parse(frozen.configuration_json);
    const declaration = JSON.parse(frozen.declaration_json);

    if (
      cfg?.modelVersion !== run.model_version ||
      cfg?.engineVersion !== run.engine_version ||
      cfg?.randomness?.seed !== frozen.random_seed ||
      cfg?.finance?.openingOperatingCashCents !==
        run.opening_cash_cents ||
      declaration?.status !== 'frozen' ||
      cfg?.catalogue?.actualProductCount !== snapshots.length
    ) {
      completeness.push({
        issue: 'Frozen configuration and run metadata disagree',
      });
    }
  }

  check(
    'History completeness and opening boundary',
    completeness,
    `${days.length}/60 days; ${retained.run_products} frozen products; supporting record counts shown below.`
  );

  // 2. Reconcile inventory for each product and day.
  const inventoryRows = all(
    db,
    `
      SELECT
        p.product_id,
        p.name,
        p.initial_quantity AS opening_units,

        COALESCE(SUM(
          CASE WHEN m.movement_type = 'opening'
          THEN m.quantity_delta ELSE 0 END
        ), 0) AS recorded_opening,

        COALESCE(SUM(
          CASE WHEN m.movement_type = 'receipt'
          THEN m.quantity_delta ELSE 0 END
        ), 0) AS received_units,

        COALESCE(SUM(
          CASE WHEN m.movement_type = 'sale'
          THEN -m.quantity_delta ELSE 0 END
        ), 0) AS sold_units,

        COALESCE(SUM(
          CASE WHEN m.movement_type = 'expiry'
          THEN -m.quantity_delta ELSE 0 END
        ), 0) AS expired_units,

        COALESCE(SUM(m.quantity_delta), 0) AS ledger_closing,

        (
          SELECT closing_units
          FROM daily_inventory d
          WHERE d.run_id = p.run_id
            AND d.product_id = p.product_id
            AND d.day = 60
        ) AS closing_units

      FROM run_products p
      LEFT JOIN inventory_movements m
        ON m.run_id = p.run_id
        AND m.product_id = p.product_id

      WHERE p.run_id = ?
      GROUP BY p.product_id
      ORDER BY p.product_id
    `,
    id
  );

  const inventoryFailures = inventoryRows.filter(
    (product) =>
      product.opening_units !== product.recorded_opening ||
      product.opening_units +
        product.received_units -
        product.sold_units -
        product.expired_units !== product.closing_units ||
      product.ledger_closing !== product.closing_units
  );

  const dailyInventoryFailures = all(
    db,
    `
      SELECT
        d.day,
        d.product_id,
        'Daily stock movement mismatch' AS issue

      FROM daily_inventory d
      WHERE d.run_id = ? AND (
        d.opening_units + d.received_units -
          d.sold_units - d.expired_units != d.closing_units

        OR d.received_units != COALESCE((
          SELECT SUM(m.quantity_delta)
          FROM inventory_movements m
          WHERE m.run_id = d.run_id
            AND m.day = d.day
            AND m.product_id = d.product_id
            AND m.movement_type = 'receipt'
        ), 0)

        OR d.sold_units != COALESCE((
          SELECT SUM(-m.quantity_delta)
          FROM inventory_movements m
          WHERE m.run_id = d.run_id
            AND m.day = d.day
            AND m.product_id = d.product_id
            AND m.movement_type = 'sale'
        ), 0)

        OR d.expired_units != COALESCE((
          SELECT SUM(-m.quantity_delta)
          FROM inventory_movements m
          WHERE m.run_id = d.run_id
            AND m.day = d.day
            AND m.product_id = d.product_id
            AND m.movement_type = 'expiry'
        ), 0)

        OR d.opening_units != CASE
          WHEN d.day = 1 THEN (
            SELECT initial_quantity
            FROM run_products p
            WHERE p.run_id = d.run_id
              AND p.product_id = d.product_id
          )
          ELSE (
            SELECT closing_units
            FROM daily_inventory old
            WHERE old.run_id = d.run_id
              AND old.product_id = d.product_id
              AND old.day = d.day - 1
          )
        END
      )
    `,
    id
  );

  check(
    'Inventory reconciliation',
    [...inventoryFailures, ...dailyInventoryFailures],
    'Opening stock + receipts − sales − write-offs = closing stock, for each product and each day.'
  );

  // 3. Check batch balances, sale eligibility, and links.
  const negative = all(
    db,
    `
      SELECT batch_id, movement_id, day, balance
      FROM (
        SELECT
          batch_id,
          movement_id,
          day,
          SUM(quantity_delta) OVER (
            PARTITION BY batch_id
            ORDER BY movement_id
          ) AS balance
        FROM inventory_movements
        WHERE run_id = ?
      )
      WHERE balance < 0
    `,
    id
  );

  const invalidSales = all(
    db,
    `
      SELECT
        t.transaction_id,
        t.day,
        i.product_id,
        i.batch_id,
        'Invalid batch sale or price' AS issue

      FROM transaction_items i
      JOIN transactions t
        ON t.transaction_id = i.transaction_id
      JOIN inventory_batches b
        ON b.batch_id = i.batch_id
      JOIN run_products p
        ON p.run_id = i.run_id
        AND p.product_id = i.product_id

      WHERE i.run_id = ? AND (
        t.day < b.received_day
        OR (
          b.expires_on_day IS NOT NULL
          AND t.day >= b.expires_on_day
        )
        OR i.product_id != b.product_id
        OR i.unit_cost_cents != b.unit_cost_cents
        OR i.unit_price_cents != p.selling_price_cents
      )
    `,
    id
  );

  const invalidMovements = all(
    db,
    `
      SELECT
        m.movement_id,
        m.day,
        m.product_id,
        'Movement linkage mismatch' AS issue

      FROM inventory_movements m
      JOIN inventory_batches b ON b.batch_id = m.batch_id
      LEFT JOIN transaction_items i
        ON i.item_id = m.transaction_item_id
      LEFT JOIN transactions t
        ON t.transaction_id = i.transaction_id

      WHERE m.run_id = ? AND (
        m.product_id != b.product_id

        OR (
          m.movement_type = 'sale' AND (
            m.quantity_delta != -i.quantity
            OR i.batch_id != m.batch_id
            OR i.product_id != m.product_id
            OR m.day != t.day
          )
        )

        OR (
          m.movement_type IN ('opening', 'receipt') AND (
            m.day != b.received_day
            OR m.quantity_delta != b.quantity_received
          )
        )

        OR (
          m.movement_type = 'expiry' AND (
            b.expires_on_day IS NULL
            OR m.day < b.expires_on_day
          )
        )
      )
    `,
    id
  );

  const missingSaleMovements = all(
    db,
    `
      SELECT
        i.item_id,
        i.transaction_id,
        'Sale lacks an inventory movement' AS issue

      FROM transaction_items i
      WHERE i.run_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_movements m
          WHERE m.transaction_item_id = i.item_id
        )
    `,
    id
  );

  const batchFailures = all(
    db,
    `
      SELECT
        b.batch_id,
        b.product_id,
        'Receipt or expiry mismatch' AS issue

      FROM inventory_batches b
      JOIN run_products p
        ON p.run_id = b.run_id
        AND p.product_id = b.product_id

      WHERE b.run_id = ? AND (
        b.unit_cost_cents != p.purchase_cost_cents

        OR (
          p.perishable = 1 AND (
            b.expires_on_day IS NULL
            OR b.expires_on_day !=
              b.received_day + p.shelf_life_days
          )
        )

        OR (
          p.perishable = 0
          AND b.expires_on_day IS NOT NULL
        )

        OR b.quantity_received != COALESCE((
          SELECT SUM(m.quantity_delta)
          FROM inventory_movements m
          WHERE m.batch_id = b.batch_id
            AND m.movement_type IN ('opening', 'receipt')
        ), 0)

        OR (
          b.expires_on_day <= 60
          AND COALESCE((
            SELECT SUM(m.quantity_delta)
            FROM inventory_movements m
            WHERE m.batch_id = b.batch_id
              AND m.day <= b.expires_on_day
          ), 0) != 0
        )
      )
    `,
    id
  );

  check(
    'No overselling, expired sales or invalid inventory links',
    [
      ...negative,
      ...invalidSales,
      ...invalidMovements,
      ...missingSaleMovements,
      ...batchFailures,
    ],
    `Negative batch balances: ${negative.length}; invalid sales: ${invalidSales.length}.`
  );

  // 4. Reconcile transaction items, daily sales, and demand.
  const transactionFailures = all(
    db,
    `
      SELECT
        t.transaction_id,
        t.day,
        t.revenue_cents,
        COALESCE(SUM(i.revenue_cents), 0) AS recorded_items_revenue

      FROM transactions t
      LEFT JOIN transaction_items i
        ON i.transaction_id = t.transaction_id

      WHERE t.run_id = ?
      GROUP BY t.transaction_id

      HAVING
        t.revenue_cents != COALESCE(SUM(i.revenue_cents), 0)
        OR t.cogs_cents != COALESCE(SUM(i.cogs_cents), 0)
        OR t.units_sold != COALESCE(SUM(i.quantity), 0)
        OR t.line_count != COUNT(DISTINCT i.product_id)
    `,
    id
  );

  const dailyRevenueFailures = all(
    db,
    `
      SELECT
        d.day,
        d.revenue_cents,
        d.cogs_cents,
        'Daily sales or customer totals mismatch' AS issue

      FROM daily_records d
      WHERE d.run_id = ? AND (
        d.revenue_cents != COALESCE((
          SELECT SUM(t.revenue_cents)
          FROM transactions t
          WHERE t.run_id = d.run_id AND t.day = d.day
        ), 0)

        OR d.cogs_cents != COALESCE((
          SELECT SUM(t.cogs_cents)
          FROM transactions t
          WHERE t.run_id = d.run_id AND t.day = d.day
        ), 0)

        OR d.units_sold != COALESCE((
          SELECT SUM(t.units_sold)
          FROM transactions t
          WHERE t.run_id = d.run_id AND t.day = d.day
        ), 0)

        OR d.transaction_count != (
          SELECT COUNT(*)
          FROM transactions t
          WHERE t.run_id = d.run_id AND t.day = d.day
        )

        OR d.customer_count != (
          SELECT COUNT(*)
          FROM customers c
          WHERE c.run_id = d.run_id AND c.day = d.day
        )

        OR d.intended_units != COALESCE((
          SELECT SUM(requested_units)
          FROM demand_items x
          WHERE x.run_id = d.run_id AND x.day = d.day
        ), 0)

        OR d.unmet_units != COALESCE((
          SELECT SUM(requested_units - fulfilled_units)
          FROM demand_items x
          WHERE x.run_id = d.run_id AND x.day = d.day
        ), 0)
      )
    `,
    id
  );

  const demandFailures = all(
    db,
    `
      SELECT
        x.demand_id,
        x.day,
        x.product_id,
        'Fulfilled demand does not match transaction items' AS issue

      FROM demand_items x
      JOIN customers c ON c.customer_id = x.customer_id

      WHERE x.run_id = ? AND (
        x.day != c.day
        OR x.fulfilled_units != COALESCE((
          SELECT SUM(i.quantity)
          FROM transactions t
          JOIN transaction_items i
            ON i.transaction_id = t.transaction_id
          WHERE t.customer_id = x.customer_id
            AND i.product_id = x.product_id
        ), 0)
      )
    `,
    id
  );

  const totalRevenue = single(
    db,
    `
      SELECT COALESCE(SUM(revenue_cents), 0) AS n
      FROM transactions
      WHERE run_id = ?
    `,
    id
  ).n;

  const dailyRevenue = days.reduce(
    (sum, day) => sum + day.revenue_cents,
    0
  );

  const revenueFailures = [
    ...transactionFailures,
    ...dailyRevenueFailures,
    ...demandFailures,
  ];

  if (totalRevenue !== dailyRevenue) {
    revenueFailures.push({
      issue: '60-day revenue mismatch',
      totalRevenue,
      dailyRevenue,
    });
  }

  check(
    'Revenue and customer reconciliation',
    revenueFailures,
    `Transactions ${totalRevenue} cents = daily reports ${dailyRevenue} cents; item and COGS totals also checked.`
  );

  // 5. Reconcile operating cash and its linked records.
  const cashRows = all(
    db,
    `
      SELECT
        *,
        SUM(amount_cents) OVER (
          ORDER BY cash_id
        ) AS expected_balance

      FROM cash_movements
      WHERE run_id = ?
      ORDER BY cash_id
    `,
    id
  );

  const cashFailures = cashRows.filter(
    (movement) =>
      movement.expected_balance !== movement.balance_after_cents ||
      movement.balance_after_cents < 0
  );

  const linkFailures = all(
    db,
    `
      SELECT
        c.cash_id,
        c.day,
        'Cash movement linkage mismatch' AS issue

      FROM cash_movements c
      LEFT JOIN transactions t
        ON t.transaction_id = c.transaction_id
      LEFT JOIN replenishment_orders o
        ON o.order_id = c.order_id

      WHERE c.run_id = ? AND (
        (
          c.movement_type = 'opening'
          AND c.amount_cents != 1500000
        )

        OR (
          c.movement_type = 'sale' AND (
            c.amount_cents != t.revenue_cents
            OR c.day != t.day
          )
        )

        OR (
          c.movement_type = 'replenishment' AND (
            c.amount_cents != -o.total_cost_cents
            OR c.day != o.ordered_day
            OR c.balance_after_cents != o.cash_after_cents
            OR c.balance_after_cents - c.amount_cents !=
              o.cash_before_cents
          )
        )
      )
    `,
    id
  );

  const missingCash = all(
    db,
    `
      SELECT
        t.transaction_id,
        'Sale lacks a cash movement' AS issue

      FROM transactions t
      WHERE t.run_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM cash_movements c
          WHERE c.transaction_id = t.transaction_id
        )
    `,
    id
  );

  const orders = all(
    db,
    `
      SELECT *
      FROM replenishment_orders
      WHERE run_id = ?
      ORDER BY order_id
    `,
    id
  );

  const spending = orders.reduce(
    (sum, order) => sum + order.total_cost_cents,
    0
  );

  let previous = run.opening_cash_cents;

  for (const day of days) {
    const dayLedger = cashRows.filter(
      (movement) => movement.day === day.day
    );

    const last =
      dayLedger.at(-1)?.balance_after_cents ?? previous;

    const daySpend = orders
      .filter((order) => order.ordered_day === day.day)
      .reduce((sum, order) => sum + order.total_cost_cents, 0);

    if (
      day.opening_cash_cents !== previous ||
      day.closing_cash_cents !== last ||
      day.opening_cash_cents + day.revenue_cents - daySpend !==
        day.closing_cash_cents ||
      day.replenishment_spend_cents !== daySpend
    ) {
      cashFailures.push({
        day: day.day,
        issue: 'Daily operating cash mismatch',
      });
    }

    previous = last;
  }

  const closingCash =
    cashRows.at(-1)?.balance_after_cents ?? null;

  if (
    cashRows.filter(
      (movement) => movement.movement_type === 'opening'
    ).length !== 1 ||
    closingCash !== run.opening_cash_cents + totalRevenue - spending
  ) {
    cashFailures.push({
      issue: 'Opening or closing cash mismatch',
      closingCash,
    });
  }

  check(
    'Operating-cash reconciliation',
    [...cashFailures, ...linkFailures, ...missingCash],
    `Closing cash = ${run.opening_cash_cents} + ${totalRevenue} − ${spending} = ${run.opening_cash_cents + totalRevenue - spending} cents.`
  );

  // 6. Check order affordability, payments, and next-day receipts.
  const orderFailures = all(
    db,
    `
      SELECT
        o.order_id,
        o.ordered_day,
        'Order cost, payment or receipt mismatch' AS issue

      FROM replenishment_orders o
      WHERE o.run_id = ? AND (
        o.ordered_day >= 60
        OR o.arrival_day != o.ordered_day + 1
        OR o.total_cost_cents > o.cash_before_cents
        OR o.cash_after_cents < 0

        OR o.total_cost_cents != COALESCE((
          SELECT SUM(i.total_cost_cents)
          FROM replenishment_items i
          WHERE i.order_id = o.order_id
        ), 0)

        OR NOT EXISTS (
          SELECT 1
          FROM cash_movements c
          WHERE c.order_id = o.order_id
            AND c.amount_cents = -o.total_cost_cents
        )

        OR EXISTS (
          SELECT 1
          FROM replenishment_items i
          LEFT JOIN inventory_batches b
            ON b.order_item_id = i.order_item_id

          WHERE i.order_id = o.order_id AND (
            b.batch_id IS NULL
            OR b.received_day != o.arrival_day
            OR b.quantity_received != i.quantity
            OR b.product_id != i.product_id
            OR b.unit_cost_cents != i.unit_cost_cents
          )
        )
      )
    `,
    id
  );

  check(
    'Affordable next-day replenishment',
    orderFailures,
    'Every paid order is received the next day, within available cash; no orders after Day 59.'
  );

  // 7. Check inventory valuation and expiry write-offs.
  const valuationFailures = all(
    db,
    `
      SELECT
        d.day,
        d.product_id,
        'Closing valuation mismatch' AS issue

      FROM daily_inventory d
      JOIN run_products p
        ON p.run_id = d.run_id
        AND p.product_id = d.product_id

      WHERE d.run_id = ?
        AND d.closing_value_cents !=
          d.closing_units * p.purchase_cost_cents
    `,
    id
  );

  const wasteFailures = all(
    db,
    `
      SELECT
        d.day,
        'Daily write-off or closing inventory mismatch' AS issue

      FROM daily_records d
      WHERE d.run_id = ? AND (
        d.write_off_cents != COALESCE((
          SELECT SUM(-m.quantity_delta * b.unit_cost_cents)
          FROM inventory_movements m
          JOIN inventory_batches b ON b.batch_id = m.batch_id
          WHERE m.run_id = d.run_id
            AND m.day = d.day
            AND m.movement_type = 'expiry'
        ), 0)

        OR d.write_off_units != COALESCE((
          SELECT SUM(-m.quantity_delta)
          FROM inventory_movements m
          WHERE m.run_id = d.run_id
            AND m.day = d.day
            AND m.movement_type = 'expiry'
        ), 0)

        OR d.closing_stock_units != COALESCE((
          SELECT SUM(closing_units)
          FROM daily_inventory i
          WHERE i.run_id = d.run_id AND i.day = d.day
        ), 0)

        OR d.closing_inventory_value_cents != COALESCE((
          SELECT SUM(closing_value_cents)
          FROM daily_inventory i
          WHERE i.run_id = d.run_id AND i.day = d.day
        ), 0)
      )
    `,
    id
  );

  check(
    'Inventory valuation and write-offs',
    [...valuationFailures, ...wasteFailures],
    'Closing stock and expiry losses use recorded purchase costs, separately from gross profit.'
  );

  // 8. Check foreign-key integrity across the database.
  const foreignKeyIssues = db.prepare(
    'PRAGMA foreign_key_check'
  ).all();

  check(
    'Database foreign keys',
    foreignKeyIssues,
    'Composite run/entity keys prevent cross-run references.'
  );

  return {
    runId: id,
    isSubmitted: Boolean(run.is_submitted),
    status: checks.every((item) => item.status === 'PASS')
      ? 'PASS'
      : 'FAIL',
    daysRetained: days.length,
    retained,
    checks,
    inventoryRows,
    totals: {
      openingCashCents: run.opening_cash_cents,
      revenueCents: totalRevenue,
      replenishmentSpendCents: spending,
      closingCashCents: closingCash,
    },
    businessProblemsAreNotIntegrityFailures: true,
  };
}