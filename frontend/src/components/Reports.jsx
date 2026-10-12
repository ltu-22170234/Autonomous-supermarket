import { useState } from 'react';
import {
  Metrics,
  Section,
  Table,
  Trend,
  RemoteState,
} from './ui.jsx';
import { money, number, label, numericColumn as n } from '../services/format.js';
import { useApi } from '../hooks/useApi.js';

const views = [
  ['performance', 'Commercial performance'],
  ['operations', 'Inventory and operations'],
  ['findings', 'Findings and recommendations'],
  ['assurance', 'Reconciliation checks'],
  ['daily', 'Daily Reports'],
];

function RecordLink({ id, onOpen, children }) {
  if (id === null || id === undefined) return '—';

  if (typeof onOpen !== 'function') {
    return <span>{children}</span>;
  }

  return (
    <button
      type="button"
      className="text-button"
      onClick={() => onOpen(id)}
    >
      {children}
    </button>
  );
}

const productColumn = (openProduct) => ({
  key: 'name',
  label: 'Product',
  render: (row) => (
    <RecordLink id={row.product_id} onOpen={openProduct}>
      {row.name}
    </RecordLink>
  ),
});

function saleLink(id, openTransaction) {
  return (
    <RecordLink id={id} onOpen={openTransaction}>
      {'Sale #' + id}
    </RecordLink>
  );
}

export default function Reports({
  runId,
  revision = 0,
  openProduct,
  openTransaction,
  openCustomer,
}) {
  const [view, setView] = useState('performance');
  const [day, setDay] = useState(1);

  const state = useApi(
    runId
      ? '/runs/' + encodeURIComponent(runId) + '/report'
      : null,
    revision,
  );

  function goDay(value) {
    const next = Number(value);

    if (!Number.isInteger(next) || next < 1 || next > 60) {
      return;
    }

    setDay(next);
    setView('daily');
  }

  if (!runId) {
    return (
      <Section title="60-Day Commercial Report">
        <p>
          Select or create a completed run to view its stored reports.
        </p>
      </Section>
    );
  }

  if (state.loading || state.error) {
    return <RemoteState state={state} />;
  }

  if (!state.data) return null;

  const report = state.data;
  const shared = { report, goDay, openProduct };

  return (
    <section aria-label="Reports for the selected run">
      <Section title="60-Day Commercial Report">
        <p>
          <strong>{report.run.name}</strong>
        </p>

        <p>
          Run ID: <code>{report.run.run_id}</code>
        </p>

        <p>
          Starting {report.run.start_date}
          {' · '}
          {report.daily.length} stored days
          {report.run.is_submitted
            ? ' · Submitted Run'
            : ' · Scenario run'}
        </p>

        <nav className="actions" aria-label="Report sections">
          {views.map(([key, caption]) => (
            <button
              key={key}
              type="button"
              className={view === key ? 'primary' : 'secondary'}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {caption}
            </button>
          ))}
        </nav>
      </Section>

      {view === 'performance' && <Performance {...shared} />}

      {view === 'operations' && <Operations {...shared} />}

      {view === 'findings' && <Diagnosis {...shared} />}

      {view === 'assurance' && (
        <Assurance
          runId={runId}
          revision={revision}
          goDay={goDay}
          openProduct={openProduct}
        />
      )}

      {view === 'daily' && (
        <Daily
          runId={runId}
          revision={revision}
          day={day}
          setDay={goDay}
          openProduct={openProduct}
          openTransaction={openTransaction}
          openCustomer={openCustomer}
        />
      )}
    </section>
  );
}

export function Performance({ report, goDay, openProduct }) {
  const s = report.summary;

  return (
    <>
      <Metrics
        items={[
          {
            label: 'Sales revenue',
            value: money(s.revenue_cents),
          },
          {
            label: 'Gross profit',
            value: money(s.gross_profit_cents),
            note: 'Revenue minus COGS; overhead excluded',
          },
          {
            label: 'Closing operating cash',
            value: money(s.closing_cash_cents),
          },
          {
            label: 'Closing inventory value',
            value: money(s.closing_inventory_value_cents),
            note: 'At purchase cost',
          },
          {
            label: 'Customers',
            value: number(s.customer_count),
          },
          {
            label: 'Transactions',
            value: number(s.transaction_count),
          },
          {
            label: 'Units sold',
            value: number(s.units_sold),
          },
          {
            label: 'COGS',
            value: money(s.cogs_cents),
          },
          {
            label: 'Write-offs',
            value: money(s.write_off_cents),
            note: number(s.expired_units) + ' expired units',
          },
          {
            label: 'Customers per day',
            value: number(s.average_customers_per_day, 1),
          },
          {
            label: 'Average basket',
            value: number(s.average_basket_units, 2) + ' units',
            note:
              number(s.average_basket_lines, 2) +
              ' distinct product lines',
          },
          {
            label: 'Average transaction',
            value: money(s.average_transaction_value_cents),
          },
        ]}
      />

      <p className="notice">
        Opening inventory cost {money(s.opening_inventory_cost_cents)}
        {' '}against the A$40,000 maximum. The unused
        {' '}{money(s.unused_inventory_budget_cents)} inventory budget
        is separate from the A$15,000 opening operating cash.
        Gross profit excludes overhead; write-offs are shown separately.
      </p>

      <Section title="Shopper activity">
        <Trend days={report.daily} goDay={goDay} />

        <Table
          title="Weekday and weekend comparison"
          rows={report.weekdayWeekend}
          rowKey="label"
          columns={[
            { key: 'label', label: 'Day type' },
            n('days', 'Days'),
            n('customers', 'Customers'),
            n('average_customers', 'Customers / day', (v) =>
              number(v, 1),
            ),
            n('average_revenue_cents', 'Revenue / day', money),
          ]}
        />
      </Section>

      <Section title="Shopping missions">
        <Table
          title="Recorded customer missions"
          rows={report.missions}
          rowKey="mission"
          columns={[
            {
              key: 'mission',
              label: 'Mission',
              render: (r) => label(r.mission),
            },
            n('customers', 'Customers'),
          ]}
        />
      </Section>

      <Section title="Activity by hour">
        <Table
          title="Customer arrivals"
          rows={report.hours}
          rowKey="hour"
          columns={[
            {
              key: 'hour',
              label: 'Hour',
              render: (r) =>
                String(r.hour).padStart(2, '0') + ':00',
            },
            n('customers', 'Customers'),
          ]}
        />
      </Section>

      <Section title="Category performance">
        <Table
          title="Sales by category"
          rows={report.categories}
          rowKey="category"
          columns={[
            { key: 'name', label: 'Category' },
            n('units_sold', 'Units sold'),
            n('revenue_cents', 'Revenue', money),
            n('cogs_cents', 'COGS', money),
            n('gross_profit_cents', 'Gross profit', money),
          ]}
        />
      </Section>

      <Section title="Product performance">
        <Table
          title="Products ranked by units sold"
          rows={[...report.products].sort(
            (a, b) => b.units_sold - a.units_sold,
          )}
          columns={[
            productColumn(openProduct),
            n('units_sold', 'Units sold'),
            n('revenue_cents', 'Revenue', money),
            n('gross_profit_cents', 'Gross profit', money),
            n('unmet_units', 'Unmet units'),
          ]}
        />
      </Section>

      <Section
        title="Lowest-selling products"
        description="Low sales alone do not establish that stock is slow-moving."
      >
        <Table
          title="Bottom ten products by units sold"
          rows={[...report.products]
            .sort((a, b) => a.units_sold - b.units_sold)
            .slice(0, 10)}
          columns={[
            productColumn(openProduct),
            n('units_sold', 'Units sold'),
            n('revenue_cents', 'Revenue', money),
            n('closing_units', 'Closing stock'),
          ]}
        />
      </Section>

      <Section title="Daily commercial evidence">
        <Table
          title="All 60 daily records"
          rows={report.daily}
          rowKey="day"
          columns={[
            {
              key: 'day',
              label: 'Day',
              render: (r) => (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => goDay(r.day)}
                >
                  {'Day ' + r.day}
                </button>
              ),
            },
            { key: 'calendar_date', label: 'Date' },
            n('customer_count', 'Customers'),
            n('transaction_count', 'Transactions'),
            n('revenue_cents', 'Revenue', money),
            n('unmet_units', 'Unmet units'),
          ]}
        />
      </Section>
    </>
  );
}

export function Operations({ report, goDay, openProduct }) {
  const s = report.summary;

  return (
    <>
      <Metrics
        items={[
          {
            label: 'Replenishment spending',
            value: money(s.replenishment_spend_cents),
          },
          {
            label: 'Units replenished',
            value: number(s.replenishment_units),
          },
          {
            label: 'Expired units',
            value: number(s.expired_units),
          },
          {
            label: 'Unmet requested units',
            value: number(s.unmet_units),
          },
        ]}
      />

      <Section
        title="Store Brain conditions and actions"
        description="Counts represent recorded product/day events, including zero counts."
      >
        <Metrics
          items={Object.entries(report.eventCounts).map(
            ([type, count]) => ({
              label: label(type),
              value: number(count),
            }),
          )}
        />
      </Section>

      <Section title="Inventory health">
        <Table
          title="Category inventory and expiry"
          rows={report.categories}
          rowKey="category"
          columns={[
            { key: 'name', label: 'Category' },
            n('stockout_events', 'Sold-out events'),
            n('low_stock_events', 'Low-stock events'),
            n('expired_units', 'Expired units'),
            n('write_off_cents', 'Write-off value', money),
            n('replenishment_spend_cents', 'Order spending', money),
            n('closing_value_cents', 'Closing value', money),
          ]}
        />
      </Section>

      <Section title="Significant operational cases">
        {report.materialCases.map((event) => (
          <article className="case" key={event.event_id}>
            <h3>
              <RecordLink
                id={event.product_id}
                onOpen={openProduct}
              >
                {event.name}
              </RecordLink>
            </h3>

            <p>
              {label(event.event_type)} · Day {event.day}
            </p>

            <p>
              <strong>Condition:</strong> {event.reason}
            </p>

            <p>
              <strong>Action:</strong> {event.action}
            </p>

            <p>
              <strong>Outcome:</strong> {event.outcome}
            </p>

            <details>
              <summary>Recorded evidence</summary>
              <pre>{JSON.stringify(event.evidence, null, 2)}</pre>
            </details>

            <button
              type="button"
              className="text-button"
              onClick={() => goDay(event.day)}
            >
              {'Inspect Day ' + event.day}
            </button>
          </article>
        ))}

        {!report.materialCases.length && (
          <p>No material cases were recorded.</p>
        )}
      </Section>

      <Section
        title="Persistent availability problems"
        description="The five products with the most unmet requested units. Sold-out counts are closing product/day events; unmet demand measures requests that could not be supplied."
      >
        <p><strong>Saved demand rule:</strong> {report.demandRule}</p>
        {report.availabilityCases.map((product) => (
          <article className="case" key={product.product_id}>
            <h3>
              <RecordLink id={product.product_id} onOpen={openProduct}>
                {product.name}
              </RecordLink>
            </h3>
            <p>
              {number(product.unmet_units)} unmet of {number(product.requested_units)} requested units;
              {' '}{number(product.fulfillment_percent, 1)}% fulfilled.
              {' '}Unmet demand on {number(product.unmet_days)} days;
              {' '}{number(product.stockout_events)} sold-out closing events.
            </p>
            <details>
              <summary>Inspect demand, decisions and next-day availability</summary>
              <p>
                Estimates are recorded at closing. Orders arrive before the next day’s
                customers; next-day unmet units show whether availability problems continued.
                Day 60 has no next-day outcome. A delivery alone does not establish that demand was met.
              </p>
              <Table
                title={`${product.name}: daily availability evidence`}
                rows={product.days}
                rowKey="day"
                columns={[
                  { key: 'day', label: 'Day', render: (row) => (
                    <button type="button" className="text-button" onClick={() => goDay(row.day)}>
                      {row.day}
                    </button>
                  ) },
                  n('requested_units', 'Requested'),
                  n('sold_units', 'Sold'),
                  n('unmet_units', 'Unmet'),
                  n('demand_estimate', 'Estimated / day', (v) => number(v, 2)),
                  n('closing_units', 'Closing'),
                  n('desired_units', 'Desired order'),
                  n('ordered_units', 'Ordered'),
                  n('next_received_units', 'Next-day received'),
                  n('next_sold_units', 'Next-day sold'),
                  n('next_unmet_units', 'Next-day unmet'),
                  { key: 'action', label: 'Closing decision' },
                ]}
              />
            </details>
          </article>
        ))}
        {!report.availabilityCases.length && <p>No unmet demand was recorded. Count: 0.</p>}
      </Section>

      <Section title="Closing inventory and slow movers">
        <Table
          title="Every product at Day 60 close"
          rows={report.products}
          columns={[
            productColumn(openProduct),
            n('initial_quantity', 'Opening'),
            n('received_units', 'Received'),
            n('units_sold', 'Sold'),
            n('expired_units', 'Expired'),
            n('closing_units', 'Closing'),
            n('closing_value_cents', 'Value', money),
            {
              key: 'is_slow_mover',
              label: 'Slow mover',
              render: (r) => (r.is_slow_mover ? 'Yes' : 'No'),
            },
          ]}
        />

        <p>
          No replenishment orders are placed at the close of Day 60.
        </p>
      </Section>
    </>
  );
}

export function Diagnosis({ report, goDay, openProduct }) {
  return (
    <Section
      title="Three commercial findings"
      description="These findings and recommendations come from the selected run's stored results."
    >
      {report.findings.map((finding, index) => (
        <article className="finding" key={finding.title}>
          <h3>
            {index + 1}. {finding.title}
          </h3>

          {[
            ['Observation', finding.observation],
            ['Evidence', finding.evidence],
            ['Diagnosis', finding.diagnosis],
            ['Business implication', finding.implication],
            ['Recommendation', finding.recommendation],
            ['Model limitation', finding.limitation],
          ].map(([caption, text]) => (
            <div className="reasoning" key={caption}>
              <strong>{caption}</strong>
              <p>{text}</p>
            </div>
          ))}

          <button
            type="button"
            className="text-button"
            onClick={() => goDay(finding.day)}
          >
            {'Inspect Day ' + finding.day}
          </button>

          {finding.productId &&
            typeof openProduct === 'function' && (
              <button
                type="button"
                className="text-button"
                onClick={() => openProduct(finding.productId)}
              >
                Inspect product
              </button>
            )}
        </article>
      ))}
    </Section>
  );
}

export function Assurance({
  runId,
  revision = 0,
  goDay,
  openProduct,
}) {
  const state = useApi(
    '/runs/' + encodeURIComponent(runId) + '/assurance',
    revision,
  );

  if (state.loading || state.error) {
    return <RemoteState state={state} />;
  }

  if (!state.data) return null;

  const a = state.data;

  return (
    <>
      <Section title="Commercial Assurance">
        <p>
          <strong>{a.status}</strong>
          {' · '}
          {a.daysRetained}/60 days retained
        </p>

        <p>
          {a.checks.filter((check) => check.status === 'PASS').length}
          /{a.checks.length} checks pass.
        </p>

        <p>
          Run ID: <code>{a.runId}</code>
        </p>

        <p>
          These checks verify recorded data. Stockouts, expiry and
          low cash can still be business problems.
        </p>
      </Section>

      <Section title="Reconciliation checks">
        {a.checks.map((check) => (
          <article className="check" key={check.name}>
            <h3>
              {check.name}: {check.status}
            </h3>

            <p>{check.detail}</p>

            {check.exceptionCount > 0 && (
              <details open>
                <summary>
                  {check.exceptionCount} exception(s)
                </summary>
                <pre>
                  {JSON.stringify(check.exceptions, null, 2)}
                </pre>
              </details>
            )}
          </article>
        ))}
      </Section>

      <Section title="Operating cash reconciliation">
        <p>
          {money(a.totals.openingCashCents)} opening cash
          {' + '}
          {money(a.totals.revenueCents)} revenue
          {' − '}
          {money(a.totals.replenishmentSpendCents)} replenishment
          {' = '}
          {money(a.totals.closingCashCents)} closing cash
        </p>

        <button
          type="button"
          className="text-button"
          onClick={() => goDay(60)}
        >
          Inspect Day 60 cash ledger
        </button>
      </Section>

      <Section title="Inventory reconciliation">
        <Table
          title="Opening + received − sold − expired = closing"
          rows={a.inventoryRows}
          columns={[
            productColumn(openProduct),
            n('opening_units', 'Opening'),
            n('received_units', 'Received'),
            n('sold_units', 'Sold'),
            n('expired_units', 'Expired'),
            n('closing_units', 'Closing'),
            n('ledger_closing', 'Ledger close'),
          ]}
        />
      </Section>

      <Section title="Retained evidence">
        <Table
          title="Stored record counts"
          rows={Object.entries(a.retained).map(([name, count]) => ({
            name,
            count,
          }))}
          rowKey="name"
          pageSize={20}
          columns={[
            {
              key: 'name',
              label: 'Record group',
              render: (r) => label(r.name),
            },
            n('count', 'Records'),
          ]}
        />
      </Section>
    </>
  );
}

export function Daily({
  runId,
  revision = 0,
  day,
  setDay,
  openProduct,
  openTransaction,
  openCustomer,
}) {
  const state = useApi(
    '/runs/' + encodeURIComponent(runId) + '/days/' + day,
    revision,
  );

  return (
    <>
      <div className="day-selector">
        <button
          type="button"
          disabled={day <= 1}
          onClick={() => setDay(day - 1)}
        >
          Previous day
        </button>

        <label>
          Inspect day
          <select
            value={day}
            onChange={(event) => setDay(Number(event.target.value))}
          >
            {Array.from({ length: 60 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {'Day ' + (index + 1)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={day >= 60}
          onClick={() => setDay(day + 1)}
        >
          Next day
        </button>
      </div>

      {state.loading || state.error ? (
        <RemoteState state={state} />
      ) : (
        state.data && (
          <DailyContent
            data={state.data}
            openProduct={openProduct}
            openTransaction={openTransaction}
            openCustomer={openCustomer}
          />
        )
      )}
    </>
  );
}

function DailyContent({
  data: d,
  openProduct,
  openTransaction,
  openCustomer,
}) {
  const s = d.summary;
  const product = productColumn(openProduct);
  const title = (caption) => 'Day ' + s.day + ': ' + caption;

  return (
    <>
      <h2>
        Day {s.day} · {s.calendar_date} ·
        {' '}{s.is_weekend ? 'Weekend' : 'Weekday'}
      </h2>

      <Metrics
        items={[
          { label: 'Customers', value: number(s.customer_count) },
          { label: 'Transactions', value: number(s.transaction_count) },
          { label: 'Units sold', value: number(s.units_sold) },
          { label: 'Revenue', value: money(s.revenue_cents) },
          { label: 'COGS', value: money(s.cogs_cents) },
          {
            label: 'Gross profit',
            value: money(s.revenue_cents - s.cogs_cents),
          },
          { label: 'Write-offs', value: money(s.write_off_cents) },
          { label: 'Closing cash', value: money(s.closing_cash_cents) },
          {
            label: 'Replenishment paid',
            value: money(s.replenishment_spend_cents),
          },
          { label: 'Units received', value: number(s.received_units) },
          { label: 'Unmet demand', value: number(s.unmet_units) },
          {
            label: 'Closing inventory value',
            value: money(s.closing_inventory_value_cents),
          },
        ]}
      />

      <Section title="Daily inventory">
        <Table
          title={title('opening and closing stock')}
          rows={d.inventory}
          columns={[
            product,
            n('opening_units', 'Opening'),
            n('received_units', 'Received'),
            n('sold_units', 'Sold'),
            n('expired_units', 'Expired'),
            n('closing_units', 'Closing'),
            n('demand_estimate', 'Estimated units / day', (v) =>
              number(v, 2),
            ),
            {
              key: 'is_slow_mover',
              label: 'Slow mover',
              render: (r) => (r.is_slow_mover ? 'Yes' : 'No'),
            },
          ]}
        />
      </Section>

      <Section title="Store Brain evidence">
        <Table
          title={title('conditions and actions')}
          rows={d.events}
          rowKey="event_id"
          columns={[
            product,
            {
              key: 'event_type',
              label: 'Condition',
              render: (r) => label(r.event_type),
            },
            { key: 'action', label: 'Action' },
            { key: 'reason', label: 'Reason' },
            {
              key: 'evidence',
              label: 'Evidence',
              render: (r) => (
                <details>
                  <summary>Inspect</summary>
                  <pre>{JSON.stringify(r.evidence, null, 2)}</pre>
                </details>
              ),
            },
          ]}
        />
      </Section>

      <Section title="Transactions">
        <Table
          title={title('completed sales')}
          rows={d.transactions}
          rowKey="transaction_id"
          columns={[
            {
              key: 'transaction_id',
              label: 'Transaction',
              render: (r) =>
                saleLink(r.transaction_id, openTransaction),
            },
            {
              key: 'arrival_minute',
              label: 'Time',
              render: (r) =>
                String(Math.floor(r.arrival_minute / 60)).padStart(
                  2,
                  '0',
                ) +
                ':' +
                String(r.arrival_minute % 60).padStart(2, '0'),
            },
            {
              key: 'mission',
              label: 'Mission',
              render: (r) => label(r.mission),
            },
            n('units_sold', 'Units'),
            n('revenue_cents', 'Revenue', money),
            n('cogs_cents', 'COGS', money),
          ]}
        />
      </Section>

      <Section title="All customer visits">
        <Table
          title={title('including no-purchase visits')}
          rows={d.customers}
          rowKey="customer_id"
          columns={[
            {
              key: 'customer_id',
              label: 'Customer',
              render: (r) => (
                <RecordLink
                  id={r.customer_id}
                  onOpen={openCustomer}
                >
                  {'Customer #' + r.customer_id}
                </RecordLink>
              ),
            },
            {
              key: 'mission',
              label: 'Mission',
              render: (r) => label(r.mission),
            },
            n('intended_units', 'Requested units'),
            n('unmet_units', 'Unmet units'),
            {
              key: 'transaction_id',
              label: 'Purchase',
              render: (r) =>
                r.transaction_id == null
                  ? 'No completed sale'
                  : saleLink(r.transaction_id, openTransaction),
            },
          ]}
        />
      </Section>

      <Section title="Replenishment orders">
        <Table
          title={title('orders paid at closing')}
          rows={d.orders}
          rowKey="order_item_id"
          columns={[
            { key: 'order_id', label: 'Order' },
            product,
            n('desired_units', 'Desired'),
            n('quantity', 'Ordered'),
            n('total_cost_cents', 'Paid', money),
            n('cash_before_cents', 'Cash before', money),
            n('cash_after_cents', 'Cash after', money),
            {
              key: 'received_day',
              label: 'Received',
              render: (r) =>
                r.received_day == null
                  ? 'Pending'
                  : 'Day ' + r.received_day,
            },
            { key: 'batch_id', label: 'Receipt batch' },
          ]}
        />

        {s.day === 60 && (
          <p>No closing replenishment orders are placed on Day 60.</p>
        )}
      </Section>

      <Section title="Operating cash ledger">
        <p>
          Opening {money(s.opening_cash_cents)}
          {' + '}revenue {money(s.revenue_cents)}
          {' − '}orders {money(s.replenishment_spend_cents)}
          {' = '}closing {money(s.closing_cash_cents)}.
        </p>

        <Table
          title={title('recorded cash movements')}
          rows={d.cash}
          rowKey="cash_id"
          pageSize={15}
          columns={[
            { key: 'cash_id', label: 'Record' },
            {
              key: 'movement_type',
              label: 'Movement',
              render: (r) => label(r.movement_type),
            },
            n('amount_cents', 'Amount', money),
            n('balance_after_cents', 'Balance after', money),
            {
              key: 'transaction_id',
              label: 'Linked record',
              render: (r) =>
                r.transaction_id != null
                  ? saleLink(r.transaction_id, openTransaction)
                  : r.order_id != null
                    ? 'Order #' + r.order_id
                    : 'Opening cash',
            },
          ]}
        />
      </Section>

      <Section title="Inventory movement ledger">
        <Table
          title={title('recorded stock movements')}
          rows={d.movements}
          rowKey="movement_id"
          pageSize={15}
          columns={[
            { key: 'movement_id', label: 'Record' },
            product,
            {
              key: 'movement_type',
              label: 'Movement',
              render: (r) => label(r.movement_type),
            },
            n('quantity_delta', 'Units +/-'),
            { key: 'batch_id', label: 'Batch' },
            { key: 'expires_on_day', label: 'Expiry day' },
            {
              key: 'transaction_id',
              label: 'Linked sale',
              render: (r) =>
                saleLink(r.transaction_id, openTransaction),
            },
          ]}
        />
      </Section>
    </>
  );
}
