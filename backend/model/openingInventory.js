// Plan starting stock from declared customer demand, rather than 2 * popularity.
// Category allocation is an approximation: real baskets select without replacement.
export function openingInventoryPlan(products, configuration) {
  const policy = configuration.catalogue.openingStock;
  const categoryWeights = new Map();

  for (const product of products) {
    categoryWeights.set(
      product.category,
      (categoryWeights.get(product.category) ?? 0) + product.popularity_weight
    );
  }

  const unitsPerLine = configuration.shopping.unitsPerLine;
  const unitWeight = unitsPerLine.reduce((sum, item) => sum + item.weight, 0);
  const expectedUnits = unitsPerLine.reduce(
    (sum, item) => sum + item.units * item.weight, 0
  ) / unitWeight;

  function categoryDemand(category, dayType) {
    const missionWeight = `${dayType}Weight`;
    const missions = configuration.shopping.missions;
    const totalMissionWeight = missions.reduce(
      (sum, mission) => sum + mission[missionWeight], 0
    );

    return configuration.customers.basePerDay[dayType] * expectedUnits *
      missions.reduce((sum, mission) => {
        const categoryTotal = Object.values(mission.categoryWeights)
          .reduce((total, weight) => total + weight, 0);
        const meanLines = (mission.basketLines.min + mission.basketLines.max) / 2;
        return sum + mission[missionWeight] / totalMissionWeight * meanLines *
          (mission.categoryWeights[category] ?? 0) / categoryTotal;
      }, 0);
  }

  const weekendDays = configuration.customers.weekendDays.length;
  return products.map((product) => {
    const share = product.popularity_weight / categoryWeights.get(product.category);
    const expectedPerDay = share * (
      (7 - weekendDays) * categoryDemand(product.category, 'weekday') +
      weekendDays * categoryDemand(product.category, 'weekend')
    ) / 7;
    const planningPerDay = expectedPerDay * policy.safetyMultiplier;
    const targetDays = policy.coverDays[product.category];
    const coverDays = product.perishable
      ? Math.min(targetDays, Math.max(1, product.shelf_life_days - 1))
      : targetDays;
    // Short-life goods stay in individual units; do not round them into waste.
    const packUnits = product.perishable
      ? 1
      : policy.productPackUnits[product.product_id] ??
        policy.packUnitsByCategory[product.category];
    const quantity = Math.ceil(planningPerDay * coverDays / packUnits) * packUnits;

    return {
      product_id: product.product_id,
      expectedUnitsPerDay: expectedPerDay,
      planningUnitsPerDay: planningPerDay,
      coverDays,
      packUnits,
      initialQuantity: quantity,
      openingCostCents: quantity * product.purchase_cost_cents,
    };
  });
}
