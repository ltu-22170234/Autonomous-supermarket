import originalCatalogue from './catalogue-v1.json' with { type: 'json' };
import { modelConfig } from '../model/config.js';
import { openingInventoryPlan } from '../model/openingInventory.js';

// Generic convenience-store shelf prices in AUD cents, reviewed 2026-10-14.
// Representative public benchmarks and estimated buying terms are documented
// in OpeningInventoryPlan.md. These are not 60 contracted supplier quotations.
// Product IDs, pack sizes, popularity and shelf lives retain the original range.
const shelfPrices = {
  P001: 400, P002: 250, P003: 450, P004: 200, P005: 250,
  P006: 320, P007: 500, P008: 450, P009: 650, P010: 550,
  P011: 200, P012: 280, P013: 300, P014: 300, P015: 450,
  P016: 450, P017: 450, P018: 450, P019: 350, P020: 200,
  P021: 300, P022: 450, P023: 300, P024: 200, P025: 550,
  P026: 350, P027: 320, P028: 300,
  P029: 350, P030: 350, P031: 300, P032: 300,
  P033: 600, P034: 550, P035: 550, P036: 500,
  P037: 120, P038: 150, P039: 150, P040: 400,
  P041: 450, P042: 350, P043: 450, P044: 400,
  P045: 790, P046: 750, P047: 850, P048: 800,
  P049: 950, P050: 900, P051: 850, P052: 600,
  P053: 650, P054: 450, P055: 1000, P056: 500,
  P057: 500, P058: 450, P059: 650, P060: 550,
};

// B&N: 24 x 600 mL water at A$13; Moco: 18 x 45 g chips at A$26.
// Round each buying cost upward to the next 5 cents.
const observedBuyingCosts = { P011: 55, P021: 145 };

const pricedCatalogue = originalCatalogue.map((product) => {
  const selling_price_cents = shelfPrices[product.product_id];
  const costPercent = modelConfig.catalogue.purchaseCostPercentByCategory[product.category];
  const purchase_cost_cents = observedBuyingCosts[product.product_id] ??
    Math.ceil(selling_price_cents * costPercent / 100 / 5) * 5;

  return { ...product, purchase_cost_cents, selling_price_cents };
});

const seedOpeningPlan = openingInventoryPlan(pricedCatalogue, modelConfig);
const quantities = new Map(seedOpeningPlan.map((plan) => [
  plan.product_id, plan.initialQuantity,
]));

export const seedCatalogue = pricedCatalogue.map((product) => ({
  ...product,
  initial_quantity: quantities.get(product.product_id),
}));
