import { useEffect, useRef } from 'react';
import {
  RemoteState,
  Metrics,
  Table,
} from './ui.jsx';
import { numericColumn as n, money, number, label } from '../services/format.js';
import { useApi } from '../hooks/useApi.js';

const resources = {
  product: 'products',
  transaction: 'transactions',
  customer: 'customers',
};

const titles = {
  product: 'Product history',
  transaction: 'Transaction evidence',
  customer: 'Customer visit evidence',
};

function AuditLink({ id, onOpen, children }) {
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
    <AuditLink id={row.product_id} onOpen={openProduct}>
      {row.name}
    </AuditLink>
  ),
});

function demandColumns(openProduct) {
  return [
    productColumn(openProduct),
    n('requested_units', 'Requested'),
    n('fulfilled_units', 'Fulfilled'),
    {
      key: 'unmet',
      label: 'Unmet',
      numeric: true,
      render: (row) =>
        number(row.requested_units - row.fulfilled_units),
    },
  ];
}

function expiryDay(row) {
  return row.expires_on_day == null
    ? 'Non-perishable'
    : 'Day ' + row.expires_on_day;
}

function arrivalTime(minutes) {
  return (
    String(Math.floor(minutes / 60)).padStart(2, '0') +
    ':' +
    String(minutes % 60).padStart(2, '0')
  );
}

export default function AuditModal({
  runId,
  target,
  onClose,
  openProduct,
  openTransaction,
  openCustomer,
}) {
  const dialog = useRef(null);
  const resource = resources[target?.type];

  const path =
    runId && resource && target?.id != null
      ? '/runs/' +
        encodeURIComponent(runId) +
        '/' +
        resource +
        '/' +
        encodeURIComponent(target.id)
      : null;

  const state = useApi(path);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (!element.open) {
      element.showModal();
    }

    return () => {
      if (element.open) {
        element.close();
      }
    };
  }, [path]);

  if (!path) return null;

  return (
    <dialog
      ref={dialog}
      className="audit-modal"
      aria-labelledby="audit-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id="audit-title">{titles[target.type]}</h2>

        <button
          type="button"
          className="secondary"
          onClick={onClose}
          autoFocus
        >
          Close
        </button>
      </div>

      <p>
        Run ID: <code>{runId}</code>
      </p>

      <p>
        Record ID: <code>{target.id}</code>
      </p>

      {state.loading || state.error ? (
        <RemoteState state={state} />
      ) : state.data ? (
        <>
          {target.type === 'product' && (
            <ProductAudit data={state.data} />
          )}

          {target.type === 'transaction' && (
            <TransactionAudit
              data={state.data}
              openProduct={openProduct}
              openCustomer={openCustomer}
            />
          )}

          {target.type === 'customer' && (
            <CustomerAudit
              data={state.data}
              openProduct={openProduct}
              openTransaction={openTransaction}
            />
          )}
        </>
      ) : null}
    </dialog>
  );
}

function ProductAudit({ data }) {
  const p = data.product;

  return (
    <>
      <h3>{p.name}</h3>

      <p>
        {label(p.category)} · {p.pack_size}
      </p>

      <p>
        {p.perishable
          ? 'Shelf life: ' + p.shelf_life_days + ' days'
          : 'Non-perishable'}
        {' · Popularity weight: '}
        {number(p.popularity_weight, 2)}
      </p>

      <Metrics
        items={[
          {
            label: 'Frozen purchase cost',
            value: money(p.purchase_cost_cents),
          },
          {
            label: 'Frozen selling price',
            value: money(p.selling_price_cents),
          },
          {
            label: 'Opening units',
            value: number(p.initial_quantity),
          },
        ]}
      />

      <p>These product details come from the run snapshot.</p>

      <Table
        title="Product inventory across Days 1–60"
        rows={data.days}
        rowKey="day"
        columns={[
          n('day', 'Day'),
          n('opening_units', 'Opening'),
          n('received_units', 'Received'),
          n('sold_units', 'Sold'),
          n('expired_units', 'Expired'),
          n('closing_units', 'Closing'),
          n('closing_value_cents', 'Closing value', money),
          n('demand_estimate', 'Estimated units / day', (v) =>
            number(v, 2),
          ),
        ]}
      />

      <Table
        title="Batch receipts and remaining stock"
        rows={data.batches}
        rowKey="batch_id"
        columns={[
          {
            key: 'batch_id',
            label: 'Batch',
            render: (row) => <code>{row.batch_id}</code>,
          },
          {
            key: 'source',
            label: 'Source',
            render: (row) => label(row.source),
          },
          n('received_day', 'Received day'),
          {
            key: 'expires_on_day',
            label: 'Expiry',
            render: expiryDay,
          },
          n('quantity_received', 'Received units'),
          n('remaining_units', 'Remaining units'),
          n('unit_cost_cents', 'Unit cost', money),
        ]}
      />

      <Table
        title="Product conditions and decisions"
        rows={data.events}
        rowKey="event_id"
        columns={[
          n('day', 'Day'),
          {
            key: 'event_type',
            label: 'Condition',
            render: (row) => label(row.event_type),
          },
          { key: 'reason', label: 'Reason' },
          { key: 'action', label: 'Action' },
          {
            key: 'evidence',
            label: 'Evidence',
            render: (row) => (
              <details>
                <summary>Inspect</summary>
                <pre>{JSON.stringify(row.evidence, null, 2)}</pre>
              </details>
            ),
          },
        ]}
      />
    </>
  );
}

function TransactionAudit({
  data,
  openProduct,
  openCustomer,
}) {
  const t = data.transaction;

  return (
    <>
      <h3>
        Transaction #{t.transaction_id} · Day {t.day}
      </h3>

      <AuditLink id={t.customer_id} onOpen={openCustomer}>
        {'Inspect customer #' + t.customer_id}
      </AuditLink>

      <Metrics
        items={[
          { label: 'Units sold', value: number(t.units_sold) },
          { label: 'Revenue', value: money(t.revenue_cents) },
          { label: 'COGS', value: money(t.cogs_cents) },
          {
            label: 'Gross profit',
            value: money(t.revenue_cents - t.cogs_cents),
          },
        ]}
      />

      <Table
        title="Sold units and batch allocations"
        rows={data.items}
        rowKey="item_id"
        columns={[
          productColumn(openProduct),
          n('quantity', 'Units'),
          n('unit_price_cents', 'Unit price', money),
          n('unit_cost_cents', 'Unit cost', money),
          n('revenue_cents', 'Revenue', money),
          n('cogs_cents', 'COGS', money),
          {
            key: 'batch_id',
            label: 'Batch',
            render: (row) => <code>{row.batch_id}</code>,
          },
          n('received_day', 'Batch received day'),
          {
            key: 'expires_on_day',
            label: 'Expiry',
            render: expiryDay,
          },
        ]}
      />

      <p>
        A product may occupy several rows when a sale uses
        multiple inventory batches.
      </p>

      <Table
        title="Original intended basket"
        rows={data.demand}
        rowKey="demand_id"
        columns={demandColumns(openProduct)}
      />
    </>
  );
}

function CustomerAudit({
  data,
  openProduct,
  openTransaction,
}) {
  const c = data.customer;
  const hasSale = c.transaction_id != null;

  return (
    <>
      <h3>
        Customer #{c.customer_id} · Day {c.day}
      </h3>

      <p>
        {label(c.mission)} · Arrival {arrivalTime(c.arrival_minute)}
      </p>

      <p>
        {hasSale ? 'Completed purchase' : 'No completed purchase'}
      </p>

      {hasSale && (
        <AuditLink
          id={c.transaction_id}
          onOpen={openTransaction}
        >
          {'Inspect sale #' + c.transaction_id}
        </AuditLink>
      )}

      <Table
        title="Requested and fulfilled products"
        rows={data.demand}
        rowKey="demand_id"
        columns={demandColumns(openProduct)}
      />
    </>
  );
}