import React, { useState } from 'react';

import { request } from '../services/api.js';

import {
  useApi,
  RemoteState,
  Section,
  Metrics,
  Table,
  money,
  number,
  numericColumn,
} from './ui.jsx';

function toForm(product) {
  return {
    product_id: product.product_id,
    name: product.name,
    category: product.category,
    pack_size: product.pack_size,

    purchase_price:
      (product.purchase_cost_cents / 100).toFixed(2),

    selling_price:
      (product.selling_price_cents / 100).toFixed(2),

    initial_quantity: String(product.initial_quantity),
    popularity_weight: String(product.popularity_weight),
    perishable: Boolean(product.perishable),

    shelf_life_days:
      String(product.shelf_life_days ?? 7),
  };
}

export default function Catalogue() {
  const [revision, setRevision] = useState(0);

  const state = useApi('/products', revision);
  const modelState = useApi('/model', revision);

  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (state.loading) {
    return <RemoteState state={state} />;
  }

  if (modelState.loading) {
    return <RemoteState state={modelState} />;
  }

  if (state.error) {
    return <RemoteState state={state} />;
  }

  if (modelState.error) {
    return <RemoteState state={modelState} />;
  }

  const products = state.data;
  const model = modelState.data?.configuration;
  const categories = model?.catalogue?.categories;
  const budget = model?.finance?.openingInventoryBudgetCents;

  if (
    !Array.isArray(products) ||
    !Array.isArray(categories) ||
    !categories.length ||
    !Number.isSafeInteger(budget)
  ) {
    return (
      <RemoteState
        state={{
          loading: false,
          error:
            'Catalogue or model response has an unexpected structure.',

          retry: () => {
            state.retry();
            modelState.retry();
          },
        }}
      />
    );
  }

  const editing = editingId !== null;

  const openingCost = products.reduce(
    (sum, product) =>
      sum +
      product.purchase_cost_cents *
        product.initial_quantity,
    0
  );

  const categoryName = (id) =>
    categories.find(
      (category) => category.id === id
    )?.name ?? id;

  function update(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
  }

  function add() {
    const ids = new Set(
      products.map((product) => product.product_id)
    );

    let next = 1;

    while (
      ids.has(`P${String(next).padStart(3, '0')}`)
    ) {
      next++;
    }

    setEditingId(null);
    setError('');
    setMessage('');

    setForm(toForm({
      product_id: `P${String(next).padStart(3, '0')}`,
      name: '',
      category: categories[0].id,
      pack_size: '',
      purchase_cost_cents: 100,
      selling_price_cents: 200,
      initial_quantity: 10,
      popularity_weight: 3,
      perishable: 0,
      shelf_life_days: null,
    }));
  }

  function edit(product) {
    setEditingId(product.product_id);
    setForm(toForm(product));
    setError('');
    setMessage('');
  }

  async function save(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const product = {
        product_id: form.product_id,
        name: form.name,
        category: form.category,
        pack_size: form.pack_size,

        purchase_cost_cents:
          Math.round(Number(form.purchase_price) * 100),

        selling_price_cents:
          Math.round(Number(form.selling_price) * 100),

        initial_quantity:
          Number(form.initial_quantity),

        popularity_weight:
          Number(form.popularity_weight),

        perishable: form.perishable,

        shelf_life_days: form.perishable
          ? Number(form.shelf_life_days)
          : null,
      };

      if (
        product.selling_price_cents <
        product.purchase_cost_cents
      ) {
        throw new Error(
          'Selling price must be at least the purchase cost.'
        );
      }

      await request(
        editing
          ? `/products/${encodeURIComponent(editingId)}`
          : '/products',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify(product),
        }
      );

      closeForm();

      setMessage(
        `Saved ${product.product_id} for future runs.`
      );

      setRevision((value) => value + 1);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(product) {
    if (busy) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await request(
        `/products/${encodeURIComponent(product.product_id)}`,
        { method: 'DELETE' }
      );

      if (editingId === product.product_id) {
        closeForm();
      }

      setMessage(
        `Deleted ${product.product_id} from the current catalogue.`
      );

      setRevision((value) => value + 1);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  const fields = form ? [
    {
      key: 'product_id',
      caption: 'Product ID',
      required: true,
      maxLength: 40,
      readOnly: editing,
    },
    {
      key: 'name',
      caption: 'Product name',
      required: true,
      maxLength: 150,
    },
    {
      key: 'pack_size',
      caption: 'Pack size',
      required: true,
      maxLength: 150,
    },
    {
      key: 'purchase_price',
      caption: 'Unit purchase cost (A$)',
      type: 'number',
      required: true,
      min: 0.01,
      max: 10000,
      step: 0.01,
    },
    {
      key: 'selling_price',
      caption: 'Unit selling price (A$)',
      type: 'number',
      required: true,
      min: 0.01,
      max: 10000,
      step: 0.01,
    },
    {
      key: 'initial_quantity',
      caption: 'Opening quantity',
      type: 'number',
      required: true,
      min: 0,
      max: 100000,
      step: 1,
    },
    {
      key: 'shelf_life_days',
      caption: 'Shelf life (days)',
      type: 'number',
      min: 1,
      max: 3650,
      step: 1,
      required: form.perishable,
      disabled: !form.perishable,
    },
  ] : [];

  return (
    <Section
      title="Catalogue"
      description="Prepare the products and opening stock for future runs."
    >
      <Metrics
        items={[
          {
            label: 'Products',
            value: number(products.length),
          },
          {
            label: 'Opening stock cost',
            value: money(openingCost),
          },
          {
            label: 'Remaining inventory budget',
            value: money(budget - openingCost),
          },
          {
            label: 'Separate opening operating cash',
            value: money(
              model.finance.openingOperatingCashCents
            ),
          },
        ]}
      />

      <p className="notice">
        Catalogue edits affect future runs. Existing runs
        retain their saved product snapshots.
        {' Opening quantities are starting stock, rather than live inventory.'}
      </p>

      {openingCost > budget && (
        <p className="notice error" role="alert">
          Opening stock exceeds {money(budget)}.
          {' Reduce its cost before starting a run.'}
        </p>
      )}

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          disabled={busy}
          onClick={add}
        >
          Add product
        </button>
      </div>

      {form && (
        <form
          className="product-form"
          onSubmit={save}
        >
          <h3>
            {editing ? 'Edit product' : 'New product'}
          </h3>

          <fieldset disabled={busy}>
            <legend>Product details</legend>

            <div className="form-grid">
              {fields.map(
                ({ key, caption, ...attributes }) => (
                  <label key={key}>
                    {caption}

                    <input
                      {...attributes}
                      value={form[key] ?? ''}
                      onChange={(event) =>
                        update(key, event.target.value)
                      }
                    />
                  </label>
                )
              )}

              <label>
                Category

                <select
                  value={form.category}
                  onChange={(event) =>
                    update('category', event.target.value)
                  }
                >
                  {categories.map((category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Popularity weight

                <select
                  value={form.popularity_weight}
                  onChange={(event) =>
                    update(
                      'popularity_weight',
                      event.target.value
                    )
                  }
                >
                  {[1, 2, 3, 4, 5].map((weight) => (
                    <option
                      key={weight}
                      value={weight}
                    >
                      {weight}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Perishable

                <select
                  value={String(form.perishable)}
                  onChange={(event) =>
                    update(
                      'perishable',
                      event.target.value === 'true'
                    )
                  }
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </label>
            </div>
          </fieldset>

          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save product'}
            </button>

            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={closeForm}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <Table
        title="Editable catalogue"
        rows={products}
        pageSize={12}
        columns={[
          {
            key: 'product_id',
            label: 'ID',
          },
          {
            key: 'name',
            label: 'Product',
          },
          {
            key: 'category',
            label: 'Category',
            render: (product) =>
              categoryName(product.category),
          },
          numericColumn(
            'purchase_cost_cents',
            'Cost',
            money
          ),
          numericColumn(
            'selling_price_cents',
            'Price',
            money
          ),
          numericColumn(
            'initial_quantity',
            'Opening units'
          ),
          numericColumn(
            'popularity_weight',
            'Popularity'
          ),
          {
            key: 'shelf_life_days',
            label: 'Shelf life',

            render: (product) =>
              product.perishable
                ? `${product.shelf_life_days} days`
                : 'Non-perishable',
          },
          {
            key: 'actions',
            label: 'Actions',

            render: (product) => (
              <div className="actions compact">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => edit(product)}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => remove(product)}
                >
                  Delete
                </button>
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}