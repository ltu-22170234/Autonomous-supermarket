export function analyseStock(products, batches, salesHistory, config, day) {
  return products.map((product) => {
    // Stock currently available for sale.
    const live = (batches.get(product.product_id) ?? []).filter(
      (batch) =>
        batch.remaining > 0 &&
        batch.received <= day &&
        (batch.expires === null || batch.expires > day)
    );

    const closing = live.reduce(
      (sum, batch) => sum + batch.remaining,
      0
    );

    // Exclude stock that expires before tomorrow's customers arrive.
    const usableTomorrow = live
      .filter(
        (batch) => batch.expires === null || batch.expires > day + 1
      )
      .reduce((sum, batch) => sum + batch.remaining, 0);

    const history = salesHistory.get(product.product_id) ?? [];
    const recent = history.slice(-config.brain.demandWindowDays);

    const estimate = recent.length
      ? Math.max(
          config.brain.minimumDemandUnitsPerDay,
          recent.reduce((sum, units) => sum + units, 0) / recent.length
        )
      : config.brain.bootstrapUnitsPerPopularityWeight *
        product.popularity_weight;

    const recentSlow = history
      .slice(-config.brain.slowMover.observationWindowDays)
      .reduce((sum, units) => sum + units, 0);

    const slow =
      history.length >= config.brain.slowMover.minimumCompletedDays &&
      closing > 0 &&
      recentSlow < closing / 2;

    const targets = slow
      ? config.brain.slowMover.reducedTargetCoverDays
      : config.brain.targetCoverDays;

    let cover = product.perishable
      ? targets.perishable
      : targets.nonPerishable;

    if (product.perishable) {
      cover = Math.min(
        cover,
        Math.max(1, product.shelf_life_days - 1)
      );
    }

    const threshold = Math.ceil(
      estimate * config.brain.lowStockCoverDays
    );

    const target = Math.ceil(estimate * cover);

    const canOrder =
      day <= config.brain.replenishment.lastOrderDay &&
      day < config.scenario.simulationDays;

    // Previous orders have arrived before this closing review.
    // With a one-day lead time, no orders are outstanding for tomorrow yet.
    const desired =
      canOrder && usableTomorrow <= threshold
        ? Math.max(0, target - usableTomorrow)
        : 0;

    const nearExpiry = live
      .filter(
        (batch) =>
          batch.expires !== null &&
          batch.expires - day <= config.inventory.expiryWarningDays
      )
      .reduce((sum, batch) => sum + batch.remaining, 0);

    return {
      product,
      closing,
      usableTomorrow,
      estimate,
      threshold,
      target,
      slow,
      recentSlow,
      desired,
      nearExpiry,
      daysCover: usableTomorrow / estimate,
    };
  });
}

export function allocateOrders(analysis, availableCash) {
  if (!Number.isSafeInteger(availableCash) || availableCash < 0) {
    throw new RangeError(
      'Available cash must be a non-negative integer in cents.'
    );
  }

  let cash = availableCash;

  // Priority: projected stockouts, lower cover, higher margin, product ID.
  const ranked = analysis
    .filter((item) => item.desired > 0)
    .sort(
      (a, b) =>
        Number(b.usableTomorrow === 0) -
          Number(a.usableTomorrow === 0) ||
        a.daysCover - b.daysCover ||
        (b.product.selling_price_cents -
          b.product.purchase_cost_cents) -
          (a.product.selling_price_cents -
            a.product.purchase_cost_cents) ||
        a.product.product_id.localeCompare(b.product.product_id)
    );

  const orders = ranked.map((item) => {
    const quantity = Math.min(
      item.desired,
      Math.floor(cash / item.product.purchase_cost_cents)
    );

    const cost = quantity * item.product.purchase_cost_cents;
    const cashBefore = cash;

    cash -= cost;

    return {
      ...item,
      quantity,
      cost,
      cashBefore,
      cashAfter: cash,
      constrained: quantity < item.desired,
    };
  });

  return {
    orders,
    remainingCash: cash,
  };
}

export function fulfillLine(batches, requested, day) {
  if (!Number.isSafeInteger(requested) || requested < 0) {
    throw new RangeError(
      'Requested units must be a non-negative integer.'
    );
  }

  let needed = requested;
  const allocations = [];

  const eligible = batches
    .filter(
      (batch) =>
        batch.remaining > 0 &&
        batch.received <= day &&
        (batch.expires === null || batch.expires > day)
    )
    .sort(
      (a, b) =>
        (a.expires ?? Infinity) - (b.expires ?? Infinity) ||
        a.received - b.received ||
        a.id.localeCompare(b.id)
    );

  for (const batch of eligible) {
    if (needed === 0) break;

    const quantity = Math.min(needed, batch.remaining);

    batch.remaining -= quantity;
    needed -= quantity;

    allocations.push({
      batch,
      quantity,
    });
  }
  return {
    allocations,
    fulfilled: requested - needed,
    unmet: needed,
  };
}