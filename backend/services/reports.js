import { getRun, assureRun } from './assurance.js';
import { clientError } from './catalogue.js';

function all(db, sql, id) {
  return db.prepare(sql).all(id);
}

function one(db, sql, id) {
  return db.prepare(sql).get(id);
}

function mapBy(rows, key = 'product_id') {
  return new Map(rows.map((row) => [row[key], row]));
}

function amount(cents) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100);
}

// Read the declaration saved when this run started.
export function runDeclaration(db, id) {
  getRun(db, id);

  const row = one(
    db,
    'SELECT * FROM run_configuration WHERE run_id = ?',
    id
  );

  if (!row) {
    throw clientError('Run configuration not found.', 404);
  }

  return {
    configuration: JSON.parse(row.configuration_json),
    declaration: JSON.parse(row.declaration_json),
    seed: row.random_seed,
  };
}

// Generate the complete commercial report.
export function reportRun(db, id) {
  const run = getRun(db, id);

  if (run.status !== 'completed') {
    throw clientError(
      'A commercial report requires a completed run.',
      409
    );
  }

  const { configuration } = runDeclaration(db, id);

  const daily = all(
    db,
    'SELECT * FROM daily_records WHERE run_id = ? ORDER BY day',
    id
  );

  const sales = mapBy(all(
    db,
    `
      SELECT
        product_id,
        SUM(quantity) AS units_sold,
        SUM(revenue_cents) AS revenue_cents,
        SUM(cogs_cents) AS cogs_cents
      FROM transaction_items
      WHERE run_id = ?
      GROUP BY product_id
    `,
    id
  ));

  const demand = mapBy(all(
    db,
    `
      SELECT
        product_id,
        SUM(requested_units) AS requested_units,
        SUM(fulfilled_units) AS fulfilled_units,
        SUM(requested_units - fulfilled_units) AS unmet_units
      FROM demand_items
      WHERE run_id = ?
      GROUP BY product_id
    `,
    id
  ));

  const inventory = mapBy(all(
    db,
    `
      SELECT
        m.product_id,

        SUM(CASE WHEN movement_type = 'receipt'
          THEN quantity_delta ELSE 0 END) AS received_units,

        SUM(CASE WHEN movement_type = 'expiry'
          THEN -quantity_delta ELSE 0 END) AS expired_units,

        SUM(CASE WHEN movement_type = 'expiry'
          THEN -quantity_delta * b.unit_cost_cents
          ELSE 0 END) AS write_off_cents,

        SUM(quantity_delta) AS closing_units

      FROM inventory_movements m
      JOIN inventory_batches b ON b.batch_id = m.batch_id
      WHERE m.run_id = ?
      GROUP BY m.product_id
    `,
    id
  ));

  const restocks = mapBy(all(
    db,
    `
      SELECT
        product_id,
        SUM(quantity) AS replenishment_units,
        SUM(total_cost_cents) AS replenishment_spend_cents
      FROM replenishment_items
      WHERE run_id = ?
      GROUP BY product_id
    `,
    id
  ));

  const conditions = mapBy(all(
    db,
    `
      SELECT
        product_id,
        SUM(event_type = 'sold_out') AS stockout_events,
        SUM(event_type = 'low_stock') AS low_stock_events,
        SUM(event_type = 'slow_mover') AS slow_mover_events,
        SUM(event_type = 'cash_constraint') AS cash_constraint_events
      FROM brain_events
      WHERE run_id = ?
      GROUP BY product_id
    `,
    id
  ));

  const closing = mapBy(all(
    db,
    `
      SELECT *
      FROM daily_inventory
      WHERE run_id = ? AND day = 60
    `,
    id
  ));

  const products = all(
    db,
    'SELECT * FROM run_products WHERE run_id = ? ORDER BY product_id',
    id
  ).map((product) => {
    const salesRow = sales.get(product.product_id) ?? {};
    const demandRow = demand.get(product.product_id) ?? {};
    const inventoryRow = inventory.get(product.product_id) ?? {};
    const restockRow = restocks.get(product.product_id) ?? {};
    const conditionRow = conditions.get(product.product_id) ?? {};

    return {
      ...product,
      units_sold: salesRow.units_sold ?? 0,
      revenue_cents: salesRow.revenue_cents ?? 0,
      cogs_cents: salesRow.cogs_cents ?? 0,

      gross_profit_cents:
        (salesRow.revenue_cents ?? 0) -
        (salesRow.cogs_cents ?? 0),

      requested_units: demandRow.requested_units ?? 0,
      unmet_units: demandRow.unmet_units ?? 0,
      received_units: inventoryRow.received_units ?? 0,
      expired_units: inventoryRow.expired_units ?? 0,
      write_off_cents: inventoryRow.write_off_cents ?? 0,
      closing_units: inventoryRow.closing_units ?? 0,

      closing_value_cents:
        (inventoryRow.closing_units ?? 0) *
        product.purchase_cost_cents,

      replenishment_units: restockRow.replenishment_units ?? 0,
      replenishment_spend_cents:
        restockRow.replenishment_spend_cents ?? 0,

      stockout_events: conditionRow.stockout_events ?? 0,
      low_stock_events: conditionRow.low_stock_events ?? 0,
      slow_mover_events: conditionRow.slow_mover_events ?? 0,
      cash_constraint_events:
        conditionRow.cash_constraint_events ?? 0,

      is_slow_mover:
        closing.get(product.product_id)?.is_slow_mover ?? 0,
    };
  });

  if (!products.length) {
    throw clientError('Run product snapshots are missing.', 409);
  }

  const categoryNames = Object.fromEntries(
    configuration.catalogue.categories.map((category) => [
      category.id,
      category.name,
    ])
  );

  const categoryIds = [
    ...new Set(products.map((product) => product.category)),
  ];

  const fields = [
    'units_sold',
    'revenue_cents',
    'cogs_cents',
    'gross_profit_cents',
    'expired_units',
    'write_off_cents',
    'closing_units',
    'closing_value_cents',
    'received_units',
    'replenishment_units',
    'replenishment_spend_cents',
    'unmet_units',
    'stockout_events',
    'low_stock_events',
    'slow_mover_events',
  ];

  const categories = categoryIds.map((category) => {
    const matching = products.filter(
      (product) => product.category === category
    );

    return {
      category,
      name: categoryNames[category] ?? category,

      ...Object.fromEntries(
        fields.map((field) => [
          field,
          matching.reduce(
            (sum, product) => sum + product[field],
            0
          ),
        ])
      ),
    };
  });

  const txn = one(
    db,
    `
      SELECT
        COUNT(*) AS transaction_count,
        COALESCE(SUM(units_sold), 0) AS units_sold,
        COALESCE(SUM(line_count), 0) AS basket_lines,
        COALESCE(SUM(revenue_cents), 0) AS revenue_cents,
        COALESCE(SUM(cogs_cents), 0) AS cogs_cents
      FROM transactions
      WHERE run_id = ?
    `,
    id
  );

  const customerCount = one(
    db,
    'SELECT COUNT(*) AS n FROM customers WHERE run_id = ?',
    id
  ).n;

  const closingCash = one(
    db,
    `
      SELECT balance_after_cents
      FROM cash_movements
      WHERE run_id = ?
      ORDER BY cash_id DESC
      LIMIT 1
    `,
    id
  )?.balance_after_cents ?? run.opening_cash_cents;

  const sumProducts = (field) => products.reduce(
    (sum, product) => sum + product[field],
    0
  );

  const summary = {
    ...txn,
    customer_count: customerCount,

    average_customers_per_day:
      daily.length ? customerCount / daily.length : 0,

    average_basket_units:
      txn.transaction_count
        ? txn.units_sold / txn.transaction_count
        : 0,

    average_basket_lines:
      txn.transaction_count
        ? txn.basket_lines / txn.transaction_count
        : 0,

    average_transaction_value_cents:
      txn.transaction_count
        ? txn.revenue_cents / txn.transaction_count
        : 0,

    gross_profit_cents: txn.revenue_cents - txn.cogs_cents,
    write_off_cents: sumProducts('write_off_cents'),
    expired_units: sumProducts('expired_units'),
    closing_cash_cents: closingCash,
    closing_inventory_value_cents: sumProducts('closing_value_cents'),
    closing_stock_units: sumProducts('closing_units'),
    replenishment_spend_cents: sumProducts('replenishment_spend_cents'),
    replenishment_units: sumProducts('replenishment_units'),
    intended_units: sumProducts('requested_units'),
    unmet_units: sumProducts('unmet_units'),
    opening_inventory_cost_cents: run.opening_inventory_cost_cents,

    unused_inventory_budget_cents:
      4000000 - run.opening_inventory_cost_cents,
  };

  const weekdayWeekend = [false, true].map((weekend) => {
    const matching = daily.filter(
      (day) => Boolean(day.is_weekend) === weekend
    );

    const count = matching.length;
    const customers = matching.reduce(
      (sum, day) => sum + day.customer_count,
      0
    );

    return {
      label: weekend ? 'Weekend' : 'Weekday',
      days: count,
      customers,
      average_customers: count ? customers / count : 0,

      average_revenue_cents: count
        ? matching.reduce(
            (sum, day) => sum + day.revenue_cents,
            0
          ) / count
        : 0,
    };
  });

  const missions = all(
    db,
    `
      SELECT mission, COUNT(*) AS customers
      FROM customers
      WHERE run_id = ?
      GROUP BY mission
    `,
    id
  );

  const hours = all(
    db,
    `
      SELECT
        CAST(arrival_minute / 60 AS INTEGER) AS hour,
        COUNT(*) AS customers
      FROM customers
      WHERE run_id = ?
      GROUP BY hour
      ORDER BY hour
    `,
    id
  );

  const eventCounts = Object.fromEntries(
    [
      'low_stock',
      'sold_out',
      'expiry_warning',
      'expiry',
      'slow_mover',
      'replenishment',
      'cash_constraint',
    ].map((type) => [type, 0])
  );

  const eventTotals = all(
    db,
    `
      SELECT event_type, COUNT(*) AS n
      FROM brain_events
      WHERE run_id = ?
      GROUP BY event_type
    `,
    id
  );

  for (const event of eventTotals) {
    eventCounts[event.event_type] = event.n;
  }

  const eventRows = all(
    db,
    `
      SELECT e.*, p.name
      FROM brain_events e
      JOIN run_products p
        ON p.run_id = e.run_id
        AND p.product_id = e.product_id
      WHERE e.run_id = ?
      ORDER BY e.day, e.event_id
    `,
    id
  );

  function score(event) {
    const evidence = JSON.parse(event.evidence_json);

    return (
      (event.event_type === 'cash_constraint' ? 1000000 : 0) +
      (evidence.writeOffCents ?? 0) +
      (evidence.units ?? 0) * 100 +
      (event.event_type === 'sold_out' ? 1000 : 0) +
      (event.event_type === 'slow_mover' ? 500 : 0)
    );
  }

  const ranked = [...eventRows].sort(
    (a, b) => score(b) - score(a)
  );

  const materialCases = [];
  const seen = new Set();

  for (const event of ranked) {
    const key = `${event.event_type}:${event.product_id}`;

    if (
      ![
        'expiry',
        'sold_out',
        'slow_mover',
        'cash_constraint',
      ].includes(event.event_type) ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    const outcome = event.order_id
      ? db.prepare(`
          SELECT o.arrival_day, i.quantity, b.batch_id
          FROM replenishment_orders o
          JOIN replenishment_items i ON i.order_id = o.order_id
          LEFT JOIN inventory_batches b
            ON b.order_item_id = i.order_item_id
          WHERE o.run_id = ? AND o.order_id = ?
        `).get(id, event.order_id)
      : null;

    materialCases.push({
      ...event,
      evidence: JSON.parse(event.evidence_json),

      outcome: outcome?.batch_id
        ? `Received ${outcome.quantity} units before customers on Day ${outcome.arrival_day}; batch ${outcome.batch_id}.`
        : event.event_type === 'expiry'
          ? 'Expired units were removed from sale and their purchase cost recorded as write-off.'
          : event.day === 60
            ? 'Closing warning retained; no Day 61 order is placed.'
            : 'No linked delivery; see the recorded action and daily closing inventory.',
    });

    if (materialCases.length >= 12) break;
  }

  const result = {
    run,
    summary,
    daily,
    products,
    categories,
    weekdayWeekend,
    missions,
    hours,
    eventCounts,
    materialCases,
    categoryNames,
  };

  result.findings = buildFindings(result);

  return result;
}

function buildFindings(report) {
  const {
    summary,
    products,
    categories,
    daily,
  } = report;

  const unavailable = [...products].sort(
    (a, b) => b.unmet_units - a.unmet_units
  )[0];

  const waste = [...categories].sort(
    (a, b) => b.write_off_cents - a.write_off_cents
  )[0];

  const dayLost = [...daily].sort(
    (a, b) => b.unmet_units - a.unmet_units
  )[0]?.day ?? 1;

  const dayWaste = [...daily].sort(
    (a, b) => b.write_off_cents - a.write_off_cents
  )[0]?.day ?? 1;

  const fulfillment = summary.intended_units
    ? `${(
        (summary.intended_units - summary.unmet_units) /
        summary.intended_units * 100
      ).toFixed(1)}%`
    : 'not applicable because no demand was generated';

  return [
    {
      title: summary.unmet_units
        ? 'Unfulfilled demand exposes an availability trade-off'
        : 'No unmet demand was recorded',

      observation: summary.unmet_units
        ? `${summary.unmet_units} requested units were not supplied over 60 days.`
        : summary.intended_units
          ? 'No requested units were left unfulfilled in this run.'
          : 'No customer demand was generated, so availability was not exercised.',

      evidence: `${unavailable.name}: ${unavailable.unmet_units} unmet of ${unavailable.requested_units} requested units; ${unavailable.stockout_events} sold-out closing events. Overall fulfillment was ${fulfillment}.`,

      diagnosis: summary.unmet_units
        ? 'Fixed stock-cover targets and one-day lead time can leave peaks uncovered. Sales-only demand estimates can also be depressed by stockouts. These are plausible contributing factors, not an isolated causal proof.'
        : 'The result is limited to this configuration and its generated demand; it does not establish availability at different customer volumes.',

      implication: summary.unmet_units
        ? 'Missed purchases reduce service and potential sales; adding stock also risks expiry and ties up cash.'
        : 'Further demand scenarios are needed before drawing a broader availability conclusion.',

      recommendation:
        'Use recorded unmet demand and product-level availability to recalibrate targets. Test adjusted opening quantities and safety stock for affected products within shelf-life and cash limits.',

      limitation:
        'Demand is synthetic and substitution is excluded; real shoppers may behave differently.',

      productId: unavailable.product_id,
      day: dayLost,
    },

    {
      title: summary.write_off_cents
        ? 'Perishable waste reduces the commercial return'
        : 'No expiry loss in the recorded run',

      observation:
        `Expiry removed ${summary.expired_units} units costing ${amount(summary.write_off_cents)}.`,

      evidence:
        `${waste.name} accounted for ${waste.expired_units} expired units and ${amount(waste.write_off_cents)} of write-offs. Gross profit after deducting write-offs, before excluded overhead, is ${amount(summary.gross_profit_cents - summary.write_off_cents)}.`,

      diagnosis: summary.write_off_cents
        ? 'Different shelf lives and uneven shopping demand leave some batches unsold before expiry. Fixed cover targets and uniformly fresh opening stock simplify this trade-off.'
        : 'The absence of write-offs may reflect this demand and stock combination rather than a universally safe policy.',

      implication:
        'Expiry consumes purchased inventory and weakens the return from gross sales margins; reducing waste must be balanced against availability.',

      recommendation:
        `Review opening quantities and target cover for ${waste.name.toLowerCase()}, especially short-lived products. Track both write-offs and unmet demand when testing smaller batch quantities.`,

      limitation:
        'All opening stock is newly received, and delivery timing is fixed; mixed ages or delays could change the result.',

      category: waste.category,
      day: dayWaste,
    },

    {
      title: 'Trading cash does not establish full-store viability',

      observation:
        `Operating cash closed at ${amount(summary.closing_cash_cents)}, from A$15,000 opening cash.`,

      evidence:
        `Revenue ${amount(summary.revenue_cents)}; COGS ${amount(summary.cogs_cents)}; gross profit ${amount(summary.gross_profit_cents)}; replenishment spending ${amount(summary.replenishment_spend_cents)}; closing inventory ${amount(summary.closing_inventory_value_cents)}.`,

      diagnosis:
        'This model measures merchandise trading and replenishment cash. Gross profit and cash use different inventory timing, and neither includes rent, utilities, insurance, hardware or other excluded overhead.',

      implication:
        'The run can support further prototype development, but its cash balance cannot justify opening a real store by itself.',

      recommendation:
        'Obtain real supplier prices, shopper observations and premises/technology operating costs. Build a full operating-cost and cash-flow assessment before making an investment decision.',

      limitation:
        'The catalogue prices and customer activity are educational assumptions requiring external calibration.',

      day: 60,
    },
  ];
}

// Return all supporting records for one day.
export function dailyReport(db, id, day) {
  getRun(db, id);

  if (!Number.isInteger(day) || day < 1 || day > 60) {
    throw clientError('Day must be an integer from 1 to 60.');
  }

  const summary = db.prepare(`
    SELECT *
    FROM daily_records
    WHERE run_id = ? AND day = ?
  `).get(id, day);

  if (!summary) {
    throw clientError('Daily report not found.', 404);
  }

  const inventory = db.prepare(`
    SELECT d.*, p.name, p.category
    FROM daily_inventory d
    JOIN run_products p
      ON p.run_id = d.run_id
      AND p.product_id = d.product_id
    WHERE d.run_id = ? AND d.day = ?
    ORDER BY p.product_id
  `).all(id, day);

  const events = db.prepare(`
    SELECT e.*, p.name
    FROM brain_events e
    JOIN run_products p
      ON p.run_id = e.run_id
      AND p.product_id = e.product_id
    WHERE e.run_id = ? AND e.day = ?
    ORDER BY e.event_id
  `).all(id, day).map((event) => ({
    ...event,
    evidence: JSON.parse(event.evidence_json),
  }));

  const transactions = db.prepare(`
    SELECT t.*, c.arrival_minute, c.mission
    FROM transactions t
    JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.run_id = ? AND t.day = ?
    ORDER BY t.transaction_id
  `).all(id, day);

  const cash = db.prepare(`
    SELECT *
    FROM cash_movements
    WHERE run_id = ? AND day = ?
    ORDER BY cash_id
  `).all(id, day);

  const orders = db.prepare(`
    SELECT
      o.*, i.*, p.name,
      b.batch_id, b.received_day

    FROM replenishment_orders o
    JOIN replenishment_items i ON i.order_id = o.order_id
    JOIN run_products p
      ON p.run_id = i.run_id
      AND p.product_id = i.product_id
    LEFT JOIN inventory_batches b
      ON b.order_item_id = i.order_item_id

    WHERE o.run_id = ? AND o.ordered_day = ?
    ORDER BY o.order_id
  `).all(id, day);

  const customers = db.prepare(`
    SELECT
      c.*,
      t.transaction_id,
      COALESCE(SUM(d.requested_units), 0) AS intended_units,
      COALESCE(SUM(
        d.requested_units - d.fulfilled_units
      ), 0) AS unmet_units

    FROM customers c
    LEFT JOIN transactions t ON t.customer_id = c.customer_id
    LEFT JOIN demand_items d ON d.customer_id = c.customer_id

    WHERE c.run_id = ? AND c.day = ?
    GROUP BY c.customer_id
    ORDER BY c.arrival_minute, c.customer_id
  `).all(id, day);

  const movements = db.prepare(`
    SELECT
      m.*, p.name,
      b.unit_cost_cents,
      b.expires_on_day,
      i.transaction_id

    FROM inventory_movements m
    JOIN run_products p
      ON p.run_id = m.run_id
      AND p.product_id = m.product_id
    JOIN inventory_batches b ON b.batch_id = m.batch_id
    LEFT JOIN transaction_items i
      ON i.item_id = m.transaction_item_id

    WHERE m.run_id = ? AND m.day = ?
    ORDER BY m.movement_id
  `).all(id, day);

  return {
    runId: id,
    summary,
    inventory,
    events,
    transactions,
    cash,
    orders,
    customers,
    movements,
  };
}

export function productHistory(db, id, productId) {
  getRun(db, id);

  const product = db.prepare(`
    SELECT *
    FROM run_products
    WHERE run_id = ? AND product_id = ?
  `).get(id, productId);

  if (!product) {
    throw clientError('Product snapshot not found.', 404);
  }

  return {
    product,

    days: db.prepare(`
      SELECT *
      FROM daily_inventory
      WHERE run_id = ? AND product_id = ?
      ORDER BY day
    `).all(id, productId),

    batches: db.prepare(`
      SELECT *
      FROM current_batch_stock
      WHERE run_id = ? AND product_id = ?
      ORDER BY received_day, batch_id
    `).all(id, productId),

    events: db.prepare(`
      SELECT *
      FROM brain_events
      WHERE run_id = ? AND product_id = ?
      ORDER BY day, event_id
    `).all(id, productId).map((event) => ({
      ...event,
      evidence: JSON.parse(event.evidence_json),
    })),
  };
}

export function transactionDetail(db, id, transactionId) {
  getRun(db, id);

  if (
    !Number.isSafeInteger(transactionId) ||
    transactionId < 1
  ) {
    throw clientError(
      'Transaction ID must be a positive integer.'
    );
  }

  const transaction = db.prepare(`
    SELECT *
    FROM transactions
    WHERE run_id = ? AND transaction_id = ?
  `).get(id, transactionId);

  if (!transaction) {
    throw clientError('Transaction not found.', 404);
  }

  const items = db.prepare(`
    SELECT
      i.*, p.name,
      b.received_day, b.expires_on_day

    FROM transaction_items i
    JOIN run_products p
      ON p.run_id = i.run_id
      AND p.product_id = i.product_id
    JOIN inventory_batches b ON b.batch_id = i.batch_id

    WHERE i.run_id = ? AND i.transaction_id = ?
    ORDER BY i.item_id
  `).all(id, transactionId);

  const demand = db.prepare(`
    SELECT d.*, p.name
    FROM demand_items d
    JOIN run_products p
      ON p.run_id = d.run_id
      AND p.product_id = d.product_id
    WHERE d.run_id = ? AND d.customer_id = ?
  `).all(id, transaction.customer_id);

  return {
    transaction,
    items,
    demand,
  };
}

export function customerDetail(db, id, customerId) {
  getRun(db, id);

  if (!Number.isSafeInteger(customerId) || customerId < 1) {
    throw clientError('Customer ID must be a positive integer.');
  }

  const customer = db.prepare(`
    SELECT c.*, t.transaction_id
    FROM customers c
    LEFT JOIN transactions t ON t.customer_id = c.customer_id
    WHERE c.run_id = ? AND c.customer_id = ?
  `).get(id, customerId);

  if (!customer) {
    throw clientError('Customer not found.', 404);
  }

  const demand = db.prepare(`
    SELECT d.*, p.name
    FROM demand_items d
    JOIN run_products p
      ON p.run_id = d.run_id
      AND p.product_id = d.product_id
    WHERE d.run_id = ? AND d.customer_id = ?
  `).all(id, customerId);

  return {
    customer,
    demand,
  };
}

// Select one completed, reconciled run for submission.
export function designateSubmitted(db, id) {
  if (assureRun(db, id).status !== 'PASS') {
    throw clientError(
      'Only a completed run passing assurance can be designated as Submitted.',
      409
    );
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    db.prepare(`
      UPDATE runs
      SET is_submitted = 0
      WHERE is_submitted = 1
    `).run();

    db.prepare(`
      UPDATE runs
      SET is_submitted = 1
      WHERE run_id = ?
    `).run(id);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getRun(db, id);
}