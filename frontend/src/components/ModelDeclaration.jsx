import React from 'react';

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

const percent = (weight) =>
  `${number(weight * 100, 0)}%`;

export default function ModelDeclaration({ runId = null }) {
  const path = runId
    ? `/runs/${encodeURIComponent(runId)}/model`
    : '/model';

  const state = useApi(path);

  if (state.loading || state.error) {
    return (
      <Section title="Model Declaration">
        <RemoteState state={state} />
      </Section>
    );
  }

  const model = state.data?.configuration;
  const declaration = state.data?.declaration;
  const seed = state.data?.seed;

  const valid =
    model?.scenario &&
    model?.finance &&
    model?.customers?.basePerDay &&
    model?.customers?.dailyVariation &&
    Array.isArray(model?.catalogue?.categories) &&
    Array.isArray(model?.shopping?.missions) &&
    Array.isArray(model?.customers?.timeBands) &&
    Array.isArray(model?.dailyCycle) &&
    Array.isArray(declaration?.sections);

  if (!valid) {
    return (
      <Section title="Model Declaration">
        <RemoteState
          state={{
            ...state,
            loading: false,
            error:
              'The model response is missing expected fields. Check the model API route.',
          }}
        />
      </Section>
    );
  }

  const categoryName = (id) =>
    model.catalogue.categories.find(
      (category) => category.id === id
    )?.name ?? id;

  return (
    <Section
      title="Model Declaration"
      description={
        runId
          ? 'Saved assumptions for the selected simulation run.'
          : 'Default assumptions for future simulation runs.'
      }
    >
      <p className="eyebrow">
        {runId
          ? 'FROZEN RUN MODEL'
          : 'FUTURE RUN DEFAULTS'}

        {' / VERSION '}
        {model.modelVersion}
      </p>

      <p className="model-notice">
        {declaration.notice}
      </p>

      {runId && (
        <p className="muted small">
          Run ID: <code>{runId}</code>
          {' · Random seed: '}
          {number(seed)}
        </p>
      )}

      <Metrics
        items={[
          {
            label: 'Simulation period',
            value: `${model.scenario.simulationDays} days`,
          },
          {
            label: 'Opening inventory limit',
            value: money(
              model.finance.openingInventoryBudgetCents
            ),
          },
          {
            label: 'Opening operating cash',
            value: money(
              model.finance.openingOperatingCashCents
            ),
          },
          {
            label: runId
              ? 'Run products'
              : 'Planned products',

            value: number(
              model.catalogue.actualProductCount ??
              model.catalogue.targetProductCount
            ),
          },
        ]}
      />

      <h3>Product catalogue assumptions</h3>

      <p>{model.catalogue.openingInventoryPlan}</p>

      <Table
        title="Declared category plan"
        rows={model.catalogue.categories}
        rowKey="id"
        pageSize={20}
        columns={[
          {
            key: 'name',
            label: 'Category',
          },
          numericColumn(
            'plannedProducts',
            'Planned products'
          ),
        ]}
      />

      <h3>Shopping missions</h3>

      <Table
        title="Mission weights and basket sizes"
        rows={model.shopping.missions}
        rowKey="id"
        pageSize={10}
        columns={[
          {
            key: 'name',
            label: 'Mission',
          },
          numericColumn(
            'weekdayWeight',
            'Weekday',
            percent
          ),
          numericColumn(
            'weekendWeight',
            'Weekend',
            percent
          ),
          {
            key: 'basketLines',
            label: 'Distinct basket lines',

            render: (mission) =>
              `${mission.basketLines.min}–${mission.basketLines.max}`,
          },
        ]}
      />

      {model.shopping.missions.map((mission) => (
        <p
          key={mission.id}
          className="preferences"
        >
          <strong>{mission.name}:</strong>{' '}

          {Object.entries(mission.categoryWeights)
            .map(
              ([id, weight]) =>
                `${categoryName(id)} ${percent(weight)}`
            )
            .join(' · ')}
        </p>
      ))}

      <h3>Customer arrivals</h3>

      <p>
        Base visitors:{' '}
        {number(model.customers.basePerDay.weekday)}
        {' on weekdays and '}
        {number(model.customers.basePerDay.weekend)}
        {' on weekends.'}

        {' Daily variation multiplier: '}
        {model.customers.dailyVariation.minMultiplier}
        –
        {model.customers.dailyVariation.maxMultiplier}.

        {' These are declared scenario assumptions.'}
      </p>

      <Table
        title="Arrival weights by time band"
        rows={model.customers.timeBands}
        rowKey="startHour"
        pageSize={10}
        columns={[
          {
            key: 'label',
            label: 'Time band',
          },
          numericColumn(
            'weekdayWeight',
            'Weekday',
            percent
          ),
          numericColumn(
            'weekendWeight',
            'Weekend',
            percent
          ),
        ]}
      />

      <h3>Operating rules and limitations</h3>

      {declaration.sections.map((section) => (
        <details key={section.title}>
          <summary>{section.title}</summary>

          {section.paragraphs.map(
            (paragraph, index) => (
              <p key={index}>{paragraph}</p>
            )
          )}
        </details>
      ))}

      <h3>Daily operating cycle</h3>

      <ol className="cycle">
        {model.dailyCycle.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </Section>
  );
}