import express from 'express';
import { getModelDeclaration } from './model/declaration.js';
import { simulateRun } from './services/simulation.js';
import { assureRun } from './services/assurance.js';
import { modelConfig } from './model/config.js';
import {
  reportRun,
  dailyReport,
  runDeclaration,
  productHistory,
  transactionDetail,
  customerDetail,
  designateSubmitted,
} from './services/reports.js';
import {
  saveProduct,
  clientError,
} from './services/catalogue.js';
export function createApp(db) {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (req, res) => {
    const metadata = db
      .prepare('SELECT value FROM app_metadata WHERE key = ?')
      .get('application');
    res.json({
      status: 'ok',
      message: 'Backend connected successfully',
      database: 'SQLite connected successfully',
      application: metadata.value,
    });
  });
  app.get('/api/products', (req, res) => {
  const products = db
    .prepare('SELECT * FROM products ORDER BY category, name')
    .all();

  res.json(products);
});

app.get('/api/runs', (req, res) => {
  const runs = db.prepare(`
    SELECT
      r.*,
      (
        SELECT COUNT(*)
        FROM daily_records d
        WHERE d.run_id = r.run_id
      ) AS completed_days

    FROM runs r

    ORDER BY
      r.is_submitted DESC,
      r.created_at DESC,
      r.run_id DESC
  `).all();

  res.json(runs);
});
app.get('/api/runs/:runId/assurance', (req, res) => {
  try {
    const result = assureRun(db, req.params.runId);
    res.json(result);
  } catch (error) {
    res.status(error.status ?? 500).json({
      error: error.message,
    });
  }
});
// Shared error handling for these JSON endpoints.
const respond = (handler) => (req, res) => {
  try {
    res.json(handler(req));
  } catch (error) {
    res.status(error.status ?? 500).json({
      error: error.message,
    });
  }
};
app.post('/api/products', (req, res) => {
  try {
    const product = saveProduct(db, req.body);
    res.status(201).json(product);
  } catch (error) {
    res.status(error.status ?? 500).json({
      error: error.message,
    });
  }
});

app.put(
  '/api/products/:productId',
  respond((req) =>
    saveProduct(
      db,
      req.body,
      req.params.productId
    )
  )
);

app.delete(
  '/api/products/:productId',
  respond((req) => {
    const result = db.prepare(
      'DELETE FROM products WHERE product_id = ?'
    ).run(req.params.productId);

    if (!result.changes) {
      throw clientError('Product not found.', 404);
    }

    return {
      deleted: true,
      product_id: req.params.productId,
    };
  })
);

app.get(
  '/api/runs/:runId/report',
  respond((req) => reportRun(db, req.params.runId))
);

app.get('/api/model', (req, res) => {
  res.json({
    configuration: modelConfig,
    declaration: getModelDeclaration(),
    seed: null,
  });
});
app.get(
  '/api/runs/:runId/model',
  respond((req) => runDeclaration(db, req.params.runId))
);
app.get(
  '/api/runs/:runId/days/:day',
  respond((req) =>
    dailyReport(
      db,
      req.params.runId,
      Number(req.params.day)
    )
  )
);

app.get(
  '/api/runs/:runId/products/:productId',
  respond((req) =>
    productHistory(
      db,
      req.params.runId,
      req.params.productId
    )
  )
);

app.get(
  '/api/runs/:runId/transactions/:transactionId',
  respond((req) =>
    transactionDetail(
      db,
      req.params.runId,
      Number(req.params.transactionId)
    )
  )
);

app.get(
  '/api/runs/:runId/customers/:customerId',
  respond((req) =>
    customerDetail(
      db,
      req.params.runId,
      Number(req.params.customerId)
    )
  )
);
app.post('/api/runs', (req, res) => {
  try {
    const run = simulateRun(db, req.body ?? {});

    res.status(201).json(run);
  } catch (error) {
    res.status(error.status ?? 500).json({
      error: error.message,
    });
  }
});
app.post(
  '/api/runs/:runId/submitted',
  respond((req) =>
    designateSubmitted(db, req.params.runId)
  )
);
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

return app;
}