import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { modelConfig } from '../model/config.js';
import { getModelDeclaration } from '../model/declaration.js';

import {
  productColumns,
  validateCatalogue,
  openingCost,
  clientError,
} from './catalogue.js';

import {
  analyseStock,
  allocateOrders,
  fulfillLine,
} from './brain.js';

export const ENGINE_VERSION = '1.1.0';

// Repeatable random customer and demand generation.
export function seededRandom(seed) {
  let value = seed >>> 0;

  return () => {
    value += 0x6D2B79F5;

    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(items, weight, random) {
  const total = items.reduce(
    (sum, item) => sum + weight(item),
    0
  );

  if (!items.length || total <= 0) return null;

  let pick = random() * total;

  for (const item of items) {
    pick -= weight(item);
    if (pick < 0) return item;
  }

  return items.at(-1);
}

export function calendarDay(start, day) {
  return new Date(
    Date.parse(`${start}T00:00:00Z`) +
    (day - 1) * 86400000
  );
}

function idOf(result) {
  return Number(result.lastInsertRowid);
}

export function simulateRun(db, options = {}) {
  // Validate settings before writing any run records.
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    throw clientError('Run settings must be an object.');
  }

  const products = validateCatalogue(
    db.prepare(
      'SELECT * FROM products ORDER BY product_id'
    ).all()
  );

  const cfg = structuredClone(modelConfig);
  const start = options.startDate ?? cfg.scenario.defaultStartDate;

  if (
    typeof start !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !Number.isFinite(Date.parse(`${start}T00:00:00Z`)) ||
    calendarDay(start, 1).toISOString().slice(0, 10) !== start
  ) {
    throw clientError(
      'Start date must be a valid YYYY-MM-DD calendar date.'
    );
  }

  for (const [option, key] of [
    ['weekdayCustomers', 'weekday'],
    ['weekendCustomers', 'weekend'],
  ]) {
    if (options[option] !== undefined) {
      if (
        !Number.isInteger(options[option]) ||
        options[option] < 0 ||
        options[option] > 500
      ) {
        throw clientError(
          `${option} must be a whole number between 0 and 500.`
        );
      }

      cfg.customers.basePerDay[key] = options[option];
    }
  }

  const seed = options.seed ?? randomBytes(4).readUInt32LE();

  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 4294967295
  ) {
    throw clientError(
      'Seed must be a whole number between 0 and 4294967295.'
    );
  }

  const name = options.name ?? 'Scenario run';

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 80
  ) {
    throw clientError('Run name must have 1–80 characters.');
  }

  const runId = `RUN-${randomUUID()}`;

  cfg.status = 'frozen';
  cfg.scenario.defaultStartDate = start;
  cfg.catalogue.actualProductCount = products.length;
  cfg.randomness = {
    algorithm: 'Mulberry32',
    seed,
  };
  cfg.engineVersion = ENGINE_VERSION;

  const declaration = getModelDeclaration(cfg, runId);

  declaration.sections.push({
    title: 'Recorded random source and catalogue',
    paragraphs: [
      `Random seed ${seed}; generator Mulberry32; engine version ${ENGINE_VERSION}. This run contains ${products.length} frozen products. All sampled customers, demand and sales are retained; exact replay is not required.`,
    ],
  });

  const random = seededRandom(seed);
  const began = performance.now();

  const batches = new Map(
    products.map((p) => [p.product_id, []])
  );

  const salesHistory = new Map(
    products.map((p) => [p.product_id, []])
  );
  const demandHistory = new Map(
    products.map((p) => [p.product_id, []])
  );

  const categories = new Map(
    cfg.catalogue.categories.map((category) => [
      category.id,
      products.filter((p) => p.category === category.id),
    ])
  );

  const pending = new Map();
  let cash = cfg.finance.openingOperatingCashCents;

  // Prepare statements once, then reuse them throughout the run.
  const stm = {
    batch: db.prepare(`
      INSERT INTO inventory_batches (
        batch_id, run_id, product_id, received_day,
        expires_on_day, quantity_received, unit_cost_cents,
        source, order_item_id
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `),

    movement: db.prepare(`
      INSERT INTO inventory_movements (
        run_id, day, product_id, batch_id, movement_type,
        quantity_delta, transaction_item_id, order_item_id,
        event_id
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `),

    cash: db.prepare(`
      INSERT INTO cash_movements (
        run_id, day, movement_type, amount_cents,
        balance_after_cents, transaction_id, order_id
      ) VALUES (?,?,?,?,?,?,?)
    `),

    event: db.prepare(`
      INSERT INTO brain_events (
        run_id, day, product_id, event_type,
        action, reason, evidence_json, order_id
      ) VALUES (?,?,?,?,?,?,?,?)
    `),

    customer: db.prepare(`
      INSERT INTO customers (
        run_id, day, arrival_minute, mission
      ) VALUES (?,?,?,?)
    `),

    demand: db.prepare(`
      INSERT INTO demand_items (
        run_id, day, customer_id, product_id,
        requested_units, fulfilled_units
      ) VALUES (?,?,?,?,?,?)
    `),

    transaction: db.prepare(`
      INSERT INTO transactions (
        run_id, day, customer_id, revenue_cents,
        cogs_cents, units_sold, line_count
      ) VALUES (?,?,?,?,?,?,?)
    `),

    item: db.prepare(`
      INSERT INTO transaction_items (
        run_id, transaction_id, product_id, batch_id,
        quantity, unit_price_cents, unit_cost_cents,
        revenue_cents, cogs_cents
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `),

    order: db.prepare(`
      INSERT INTO replenishment_orders (
        run_id, ordered_day, arrival_day, total_cost_cents,
        cash_before_cents, cash_after_cents
      ) VALUES (?,?,?,?,?,?)
    `),

    orderItem: db.prepare(`
      INSERT INTO replenishment_items (
        run_id, order_id, product_id, desired_units,
        quantity, unit_cost_cents, total_cost_cents
      ) VALUES (?,?,?,?,?,?,?)
    `),

    daily: db.prepare(`
      INSERT INTO daily_records
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `),

    dailyInventory: db.prepare(`
      INSERT INTO daily_inventory
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `),
  };

  function event(
    day,
    product,
    type,
    action,
    reason,
    evidence,
    orderId = null
  ) {
    return idOf(
      stm.event.run(
        runId,
        day,
        product.product_id,
        type,
        action,
        reason,
        JSON.stringify(evidence),
        orderId
      )
    );
  }

  function receive(
    product,
    day,
    quantity,
    source,
    orderItemId = null
  ) {
    const batch = {
      id: `B-${randomUUID()}`,
      received: day,
      expires: product.perishable
        ? day + product.shelf_life_days
        : null,
      remaining: quantity,
      cost: product.purchase_cost_cents,
    };

    stm.batch.run(
      batch.id,
      runId,
      product.product_id,
      day,
      batch.expires,
      quantity,
      batch.cost,
      source,
      orderItemId
    );

    stm.movement.run(
      runId,
      day,
      product.product_id,
      batch.id,
      source === 'opening' ? 'opening' : 'receipt',
      quantity,
      null,
      orderItemId,
      null
    );

    batches.get(product.product_id).push(batch);
  }

  // Save the entire run atomically.
  db.exec('BEGIN IMMEDIATE');

  try {
    db.prepare(`
      INSERT INTO runs (
        run_id, name, status, model_version, engine_version,
        start_date, simulation_days,
        opening_inventory_cost_cents, opening_cash_cents,
        created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      runId,
      name.trim(),
      'running',
      cfg.modelVersion,
      ENGINE_VERSION,
      start,
      60,
      openingCost(products),
      cash,
      new Date().toISOString()
    );

    db.prepare(`
      INSERT INTO run_configuration VALUES (?,?,?,?)
    `).run(
      runId,
      JSON.stringify(cfg),
      JSON.stringify(declaration),
      seed
    );

    const snapshot = db.prepare(`
      INSERT INTO run_products (
        run_id, ${productColumns.join(',')}
      ) VALUES (
        ?, ${productColumns.map(() => '?').join(',')}
      )
    `);

    for (const product of products) {
      snapshot.run(
        runId,
        ...productColumns.map((column) => product[column])
      );

      if (product.initial_quantity > 0) {
        receive(
          product,
          1,
          product.initial_quantity,
          'opening'
        );
      }
    }

    stm.cash.run(
      runId, 1, 'opening', cash, cash, null, null
    );

    for (let day = 1; day <= 60; day++) {
      const date = calendarDay(start, day);
      const weekend = cfg.customers.weekendDays.includes(
        date.getUTCDay()
      );
      const dayType = weekend ? 'weekend' : 'weekday';

      const daily = {
        openingCash: cash,
        customers: 0,
        transactions: 0,
        units: 0,
        intended: 0,
        unmet: 0,
        revenue: 0,
        cogs: 0,
        waste: 0,
        wasteUnits: 0,
        spend: 0,
        received: 0,
      };

      const perProduct = new Map(
        products.map((product) => [
          product.product_id,
          {
            opening: batches
              .get(product.product_id)
              .reduce((sum, batch) => sum + batch.remaining, 0),
            received: 0,
            sold: 0,
            requested: 0,
            expired: 0,
          },
        ])
      );

      // 1. Receive yesterday's paid replenishment orders.
      for (const item of pending.get(day) ?? []) {
        receive(
          item.product,
          day,
          item.quantity,
          'replenishment',
          item.orderItemId
        );

        perProduct.get(item.product.product_id).received +=
          item.quantity;

        daily.received += item.quantity;
      }

      // 2. Remove expired stock before customer arrivals.
      for (const product of products) {
        const expired = batches
          .get(product.product_id)
          .filter(
            (batch) =>
              batch.remaining > 0 &&
              batch.expires !== null &&
              batch.expires <= day
          );

        if (!expired.length) continue;

        const units = expired.reduce(
          (sum, batch) => sum + batch.remaining,
          0
        );

        const value = expired.reduce(
          (sum, batch) => sum + batch.remaining * batch.cost,
          0
        );

        const eventId = event(
          day,
          product,
          'expiry',
          `Removed ${units} expired units`,
          'Expiry reached before customer arrivals',
          {
            units,
            writeOffCents: value,
            batches: expired.map((batch) => batch.id),
          }
        );

        for (const batch of expired) {
          stm.movement.run(
            runId,
            day,
            product.product_id,
            batch.id,
            'expiry',
            -batch.remaining,
            null,
            null,
            eventId
          );

          batch.remaining = 0;
        }

        daily.waste += value;
        daily.wasteUnits += units;
        perProduct.get(product.product_id).expired += units;
      }

      // 3. Generate today's customers and shopping missions.
      const multiplier =
        cfg.customers.dailyVariation.minMultiplier +
        random() * (
          cfg.customers.dailyVariation.maxMultiplier -
          cfg.customers.dailyVariation.minMultiplier
        );

      const count = Math.round(
        cfg.customers.basePerDay[dayType] * multiplier
      );

      const visitors = Array.from({ length: count }, () => {
        const band = weighted(
          cfg.customers.timeBands,
          (item) => item[`${dayType}Weight`],
          random
        );

        return {
          minute: Math.floor(
            (
              band.startHour +
              random() * (band.endHour - band.startHour)
            ) * 60
          ),
          mission: weighted(
            cfg.shopping.missions,
            (item) => item[`${dayType}Weight`],
            random
          ),
        };
      }).sort((a, b) => a.minute - b.minute);

      // 4. Process customers in arrival order.
      for (const visitor of visitors) {
        const customerId = idOf(
          stm.customer.run(
            runId,
            day,
            visitor.minute,
            visitor.mission.id
          )
        );

        daily.customers++;

        const lineCount =
          visitor.mission.basketLines.min +
          Math.floor(
            random() * (
              visitor.mission.basketLines.max -
              visitor.mission.basketLines.min + 1
            )
          );

        const chosen = new Set();
        const fulfilledLines = [];

        let revenue = 0;
        let cogs = 0;
        let units = 0;

        for (let line = 0; line < lineCount; line++) {
          const eligible = Object.entries(
            visitor.mission.categoryWeights
          ).filter(
            ([categoryId, weight]) =>
              weight > 0 &&
              (categories.get(categoryId) ?? []).some(
                (product) => !chosen.has(product.product_id)
              )
          );

          const category = weighted(
            eligible,
            ([, weight]) => weight,
            random
          );

          if (!category) break;

          const product = weighted(
            categories.get(category[0]).filter(
              (item) => !chosen.has(item.product_id)
            ),
            (item) => item.popularity_weight,
            random
          );

          chosen.add(product.product_id);

          const requested = weighted(
            cfg.shopping.unitsPerLine,
            (item) => item.weight,
            random
          ).units;

          const result = fulfillLine(
            batches.get(product.product_id),
            requested,
            day
          );

          stm.demand.run(
            runId,
            day,
            customerId,
            product.product_id,
            requested,
            result.fulfilled
          );

          daily.intended += requested;
          perProduct.get(product.product_id).requested += requested;
          daily.unmet += result.unmet;

          if (result.fulfilled > 0) {
            fulfilledLines.push({
              product,
              ...result,
            });

            units += result.fulfilled;
            revenue +=
              result.fulfilled * product.selling_price_cents;

            cogs += result.allocations.reduce(
              (sum, allocation) =>
                sum + allocation.quantity * allocation.batch.cost,
              0
            );

            perProduct.get(product.product_id).sold +=
              result.fulfilled;
          }
        }

        // Keep the customer and demand records even without a sale.
        if (units === 0) continue;

        const transactionId = idOf(
          stm.transaction.run(
            runId,
            day,
            customerId,
            revenue,
            cogs,
            units,
            fulfilledLines.length
          )
        );

        for (const line of fulfilledLines) {
          for (const allocation of line.allocations) {
            const { product } = line;
            const { batch, quantity } = allocation;

            const itemId = idOf(
              stm.item.run(
                runId,
                transactionId,
                product.product_id,
                batch.id,
                quantity,
                product.selling_price_cents,
                batch.cost,
                quantity * product.selling_price_cents,
                quantity * batch.cost
              )
            );

            stm.movement.run(
              runId,
              day,
              product.product_id,
              batch.id,
              'sale',
              -quantity,
              itemId,
              null,
              null
            );
          }
        }

        cash += revenue;

        stm.cash.run(
          runId,
          day,
          'sale',
          revenue,
          cash,
          transactionId,
          null
        );

        daily.transactions++;
        daily.units += units;
        daily.revenue += revenue;
        daily.cogs += cogs;
      }

      // Include zero-sale days in the demand history.
      for (const product of products) {
        salesHistory.get(product.product_id).push(
          perProduct.get(product.product_id).sold
        );
        demandHistory.get(product.product_id).push(
          perProduct.get(product.product_id).requested
        );
      }

      // 5. Review stock and allocate affordable orders.
      const analysis = analyseStock(
        products,
        batches,
        salesHistory,
        demandHistory,
        cfg,
        day
      );

      const allocated = allocateOrders(analysis, cash);
      const decisions = new Map();

      for (const order of allocated.orders) {
        const product = order.product;
        let orderId = null;

        if (order.quantity > 0) {
          orderId = idOf(
            stm.order.run(
              runId,
              day,
              day + 1,
              order.cost,
              order.cashBefore,
              order.cashAfter
            )
          );

          const orderItemId = idOf(
            stm.orderItem.run(
              runId,
              orderId,
              product.product_id,
              order.desired,
              order.quantity,
              product.purchase_cost_cents,
              order.cost
            )
          );

          const next = pending.get(day + 1) ?? [];

          next.push({
            product,
            quantity: order.quantity,
            orderItemId,
          });

          pending.set(day + 1, next);

          cash = order.cashAfter;
          daily.spend += order.cost;

          stm.cash.run(
            runId,
            day,
            'replenishment',
            -order.cost,
            cash,
            null,
            orderId
          );

          event(
            day,
            product,
            'replenishment',
            `Ordered ${order.quantity} units for Day ${day + 1}`,
            'Projected stock meets the reorder threshold',
            {
              desiredUnits: order.desired,
              orderedUnits: order.quantity,
              targetUnits: order.target,
              usableTomorrow: order.usableTomorrow,
              demandEstimate: order.estimate,
              demandObservation: order.demandEvidence,
              costCents: order.cost,
              cashBeforeCents: order.cashBefore,
              cashAfterCents: order.cashAfter,
            },
            orderId
          );
        }

        if (order.constrained) {
          event(
            day,
            product,
            'cash_constraint',
            order.quantity
              ? `Reduced order to ${order.quantity} units`
              : 'Deferred replenishment',
            'Available cash cannot fund the desired quantity',
            {
              desiredUnits: order.desired,
              orderedUnits: order.quantity,
              deferredUnits: order.desired - order.quantity,
              cashBeforeCents: order.cashBefore,
              unitCostCents: product.purchase_cost_cents,
            },
            orderId
          );
        }

        decisions.set(product.product_id, {
          orderId,
          quantity: order.quantity,
          constrained: order.constrained,
        });
      }

      cash = allocated.remainingCash;

      // 6. Record closing conditions and product evidence.
      let closingUnits = 0;
      let closingValue = 0;

      for (const item of analysis) {
        const product = item.product;
        const decision = decisions.get(product.product_id);

        const action =
          day === 60
            ? 'No order; simulation horizon ends'
            : decision?.quantity
              ? `Ordered ${decision.quantity} units for tomorrow`
              : decision?.constrained
                ? 'Order deferred by cash constraint'
                : 'No order; projected target or threshold does not require replenishment';

        const evidence = {
          closingUnits: item.closing,
          usableTomorrow: item.usableTomorrow,
          demandEstimate: item.estimate,
          demandObservation: item.demandEvidence,
          threshold: item.threshold,
          targetUnits: item.target,
        };

        if (item.closing === 0) {
          event(
            day,
            product,
            'sold_out',
            action,
            'Closing saleable inventory is zero',
            evidence,
            decision?.orderId ?? null
          );
        } else if (item.closing <= item.threshold) {
          event(
            day,
            product,
            'low_stock',
            action,
            'Closing stock is at or below two days of estimated sales',
            evidence,
            decision?.orderId ?? null
          );
        }

        if (item.nearExpiry > 0) {
          event(
            day,
            product,
            'expiry_warning',
            'Flagged for remote manager attention',
            'Saleable stock expires in one or two days',
            { units: item.nearExpiry }
          );
        }

        if (item.slow) {
          event(
            day,
            product,
            'slow_mover',
            'Reduced future target cover; flagged for manager review',
            'Fourteen-day sales are below half the closing stock',
            {
              closingUnits: item.closing,
              salesLast14Days: item.recentSlow,
              reducedCoverDays: product.perishable
                ? cfg.brain.slowMover.reducedTargetCoverDays.perishable
                : cfg.brain.slowMover.reducedTargetCoverDays.nonPerishable,
            }
          );
        }

        closingUnits += item.closing;
        closingValue +=
          item.closing * product.purchase_cost_cents;
      }

      // 7. Save the day's totals and individual product results.
      stm.daily.run(
        runId,
        day,
        date.toISOString().slice(0, 10),
        Number(weekend),
        daily.customers,
        daily.transactions,
        daily.units,
        daily.intended,
        daily.unmet,
        daily.revenue,
        daily.cogs,
        daily.waste,
        daily.wasteUnits,
        daily.openingCash,
        cash,
        daily.spend,
        daily.received,
        closingUnits,
        closingValue
      );

      for (const item of analysis) {
        const totals = perProduct.get(item.product.product_id);

        stm.dailyInventory.run(
          runId,
          day,
          item.product.product_id,
          totals.opening,
          totals.received,
          totals.sold,
          totals.expired,
          item.closing,
          item.closing * item.product.purchase_cost_cents,
          item.estimate,
          item.threshold,
          Number(item.slow)
        );
      }

      // Remove empty batches from the in-memory working state.
      // Their database history remains intact.
      for (const product of products) {
        batches.set(
          product.product_id,
          batches.get(product.product_id).filter(
            (batch) => batch.remaining > 0
          )
        );
      }
    }

    db.prepare(`
      UPDATE runs
      SET status = 'completed',
          completed_at = ?,
          duration_ms = ?
      WHERE run_id = ?
    `).run(
      new Date().toISOString(),
      Math.round(performance.now() - began),
      runId
    );

    db.exec('COMMIT');

    return db.prepare(
      'SELECT * FROM runs WHERE run_id = ?'
    ).get(runId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
