import { modelConfig as model} from './config.js'

const aud = (cents) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100);

//Declaration text is derived from the same configuration exposed by the API
export function getModelDeclaration(configuration= model, runId=null){
    const model = configuration;
    return {
    modelVersion: model.modelVersion,
    status: runId ? 'frozen' : 'draft',
    notice: runId ? `Frozen Model Declaration for Run ${runId}. Configuration and product snapshots are retained with this run.` : 'Proposed model for future runs. Starting a run freezes a separate copy of these assumptions and the current catalogue.',
    sections: [
      { title: 'Commercial boundary', paragraphs: [
        `${model.scenario.simulationDays} consecutive simulated days. Opening inventory costs at most ${aud(model.finance.openingInventoryBudgetCents)}; opening operating cash is ${aud(model.finance.openingOperatingCashCents)}. Opening stock is funded separately, and unused inventory budget never becomes cash.`,
        `Money uses ${model.finance.moneyRepresentation}; inventory is valued at ${model.finance.inventoryValuation}. Gross profit is ${model.finance.grossProfitDefinition}. ${model.finance.taxTreatment}`,
        `Excluded costs: ${model.finance.excludedCosts.join(', ')}.`,
      ] },
      { title: 'Customer activity', paragraphs: [
        `Base activity is ${model.customers.basePerDay.weekday} weekday customers or ${model.customers.basePerDay.weekend} weekend customers. Each day uses a uniform multiplier between ${model.customers.dailyVariation.minMultiplier} and ${model.customers.dailyVariation.maxMultiplier}, then rounds to a whole customer count. Saturday and Sunday are weekends.`,
        model.customers.arrivalRule,
        model.customers.rationale,
        `Default start date: ${model.scenario.defaultStartDate}. ${model.scenario.calendar}.`,
      ] },
      { title: 'Shopping and product demand', paragraphs: [
        `Shopping mission controls distinct basket lines and category preferences. Line count uses a ${model.shopping.basketLineDistribution}. Each line requests one unit with 85% probability or two with 15% probability.`,
        `${model.shopping.productSelection} Each product has a reviewed popularity weight from ${model.catalogue.popularityWeightRange.min} to ${model.catalogue.popularityWeightRange.max}, so selection within a category is not uniform by default.`,
        model.shopping.availabilityRule,
        `${model.shopping.emptyBasketRule} No substitution, discounts or price-elasticity modelling is proposed.`,
      ] },
      { title: 'Batches and expiry', paragraphs: [
        `Opening stock is received on Day ${model.inventory.openingStockReceivedDay}. A batch expires on received day + its product shelf-life days. For example, a three-day batch received on Day 1 is saleable on Days 1–3 and removed before customers on Day 4.`,
        model.inventory.expiryRemovalRule,
        `Sales policy: ${model.inventory.sellingPolicy} ${model.inventory.warningRule} Write-off value is ${model.inventory.writeOffValuation}. Runtime stock cannot be edited directly.`,
      ] },
      { title: 'Stock and slow-moving conditions', paragraphs: [
        model.brain.observedDemandRule,
        `${model.brain.bootstrapDemandRule} ${model.brain.lowStockRule}`,
        `After ${model.brain.slowMover.minimumCompletedDays} completed days: ${model.brain.slowMover.rule} ${model.brain.slowMover.action}`,
      ] },
      { title: 'Autonomous replenishment', paragraphs: [
        `Normal target cover is ${model.brain.targetCoverDays.nonPerishable} days for non-perishable products and ${model.brain.targetCoverDays.perishable} for perishable products. Slow movers use ${model.brain.slowMover.reducedTargetCoverDays.nonPerishable} and ${model.brain.slowMover.reducedTargetCoverDays.perishable} days respectively. ${model.brain.perishableCoverRule}`,
        `Review: ${model.brain.replenishment.reviewRule} Desired quantity: ${model.brain.replenishment.quantityRule}.`,
        `Priority: ${model.brain.replenishment.priorityRule} Cash rule: ${model.brain.replenishment.cashRule}`,
        `Orders are paid ${model.brain.replenishment.paymentAt}, received ${model.brain.replenishment.receiptAt}, and need no manager approval. No orders are placed after Day ${model.brain.replenishment.lastOrderDay}; Day 60 still records closing warnings.`,
      ] },
      { title: 'Evidence and run integrity', paragraphs: [
        model.brain.eventRule,
        `The run snapshots ${model.recording.snapshotIncludes.join('; ')}. History is append-only in SQLite. ${model.recording.traceability}`,
        `Evidence retained: ${model.recording.retain.join('; ')}. Reconciliation will check inventory, transaction revenue and operating cash against that history.`,
      ] },
      { title: 'Material limitations', paragraphs: model.limitations },
    ],
  };
}