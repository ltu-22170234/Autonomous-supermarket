import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('operations report renders persistent demand evidence and the explicit zero case', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  try {
    const { Operations } = await server.ssrLoadModule('/src/components/Reports.jsx');
    const report = {
      summary: { replenishment_spend_cents: 0, replenishment_units: 0, expired_units: 0, unmet_units: 245 },
      eventCounts: { sold_out: 51, slow_mover: 0, cash_constraint: 0 },
      categories: [], materialCases: [], products: [],
      demandRule: 'Saved model rule for this run',
      availabilityCases: [{
        product_id: 'P045', name: 'Chicken sandwich',
        requested_units: 594, sold_units: 349, unmet_units: 245,
        stockout_events: 51, unmet_days: 40, fulfillment_percent: 349 / 594 * 100,
        days: [{ day: 60, requested_units: 10, sold_units: 5, unmet_units: 5,
          demand_estimate: 11, closing_units: 0, desired_units: 0, ordered_units: 0,
          next_received_units: null, next_sold_units: null, next_unmet_units: null,
          action: 'No order; simulation horizon ends' }],
      }],
    };
    const html = renderToStaticMarkup(createElement(Operations, {
      report, goDay: () => {}, openProduct: () => {},
    }));
    assert.match(html, /Persistent availability problems/);
    assert.match(html, /245.*unmet of.*594/s);
    assert.match(html, /Saved model rule for this run/);
    assert.match(html, /Next-day received/);
    assert.match(html, /Next-day unmet/);
    assert.match(html, /No order; simulation horizon ends/);
    assert.match(html, /Slow mover/);
    assert.match(html, /Cash constraint/);

    const quiet = renderToStaticMarkup(createElement(Operations, {
      report: { ...report, availabilityCases: [] }, goDay: () => {},
    }));
    assert.match(quiet, /No unmet demand was recorded. Count: 0./);
  } finally {
    await server.close();
  }
});
