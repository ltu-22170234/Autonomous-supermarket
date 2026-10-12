import { useState } from 'react';

import {
  createRun,
  designateSubmitted,
} from '../services/api.js';

import {
  Section,
  Table,
  RemoteState,
} from './ui.jsx';
import { number } from '../services/format.js';

export default function RunManager({
  configuration,
  runsState,
  selectedRunId = null,
  onCreated,
  onSelect,
  onSubmitted,
}) {
  const [form, setForm] = useState(() => ({
    name: 'Scenario run',
    startDate: configuration.scenario.defaultStartDate,

    weekdayCustomers: String(
      configuration.customers.basePerDay.weekday
    ),

    weekendCustomers: String(
      configuration.customers.basePerDay.weekend
    ),

    seed: '',
  }));

  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const busy = pending !== null;

  const runs = Array.isArray(runsState.data)
    ? runsState.data
    : [];

  const listState =
    !runsState.loading &&
    !runsState.error &&
    !Array.isArray(runsState.data)
      ? {
          ...runsState,
          error: 'The run list response should be an array.',
        }
      : runsState;

  function update(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function create(event) {
    event.preventDefault();

    if (busy) return;

    setPending({ type: 'create' });
    setError('');
    setMessage('');

    try {
      const settings = {
        name: form.name.trim(),
        startDate: form.startDate,
        weekdayCustomers: Number(form.weekdayCustomers),
        weekendCustomers: Number(form.weekendCustomers),
      };

      // Preserve seed 0; omit a blank seed so the backend generates one.
      if (form.seed.trim() !== '') {
        settings.seed = Number(form.seed);
      }

      const run = await createRun(settings);

      setMessage(
        `Completed ${run.run_id}. Its saved model is now selected.`
      );

      await onCreated(run.run_id);
    } catch (error) {
      setError(error.message);
      runsState.retry();
    } finally {
      setPending(null);
    }
  }

  async function submit(runId) {
    if (busy) return;

    setPending({
      type: 'submit',
      runId,
    });

    setError('');
    setMessage('');

    try {
      await designateSubmitted(runId);

      setMessage(
        `Submitted Run selected: ${runId}.`
      );

      await onSubmitted(runId);
    } catch (error) {
      setError(error.message);
      runsState.retry();
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <p className="notice">
        Every run has a separate 60-day history.
        Creating another run preserves the current Submitted Run.
        Selecting a different Submitted Run changes its designation
        while preserving both runs’ history.
      </p>

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

      <Section
        title="Create a simulation run"
        description="The current catalogue and scenario settings are saved when the run starts."
      >
        <form onSubmit={create}>
          <fieldset disabled={busy}>
            <legend>Scenario settings</legend>

            <div className="form-grid">
              <label>
                Run name

                <input
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(event) =>
                    update('name', event.target.value)
                  }
                />
              </label>

              <label>
                Day 1 date

                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(event) =>
                    update('startDate', event.target.value)
                  }
                />
              </label>

              <label>
                Base weekday customers

                <input
                  type="number"
                  required
                  min="0"
                  max="500"
                  step="1"
                  value={form.weekdayCustomers}
                  onChange={(event) =>
                    update(
                      'weekdayCustomers',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Base weekend customers

                <input
                  type="number"
                  required
                  min="0"
                  max="500"
                  step="1"
                  value={form.weekendCustomers}
                  onChange={(event) =>
                    update(
                      'weekendCustomers',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Random seed (optional)

                <input
                  type="number"
                  min="0"
                  max="4294967295"
                  step="1"
                  placeholder="Leave blank to generate a seed"
                  value={form.seed}
                  onChange={(event) =>
                    update('seed', event.target.value)
                  }
                />
              </label>
            </div>
          </fieldset>

          <button type="submit" disabled={busy}>
            {pending?.type === 'create'
              ? 'Running 60 simulated days…'
              : 'Start 60-day run'}
          </button>

          <p className="muted small">
            Opening operating cash is A$15,000.
            Opening inventory must stay within A$40,000.
            Each successful submission creates a new Run ID.
          </p>
        </form>
      </Section>

      <Section
        title="Saved runs"
        description="Select a run to inspect its saved Model Declaration."
      >
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => onSelect(null)}
          >
            View draft model
          </button>

          <button
            type="button"
            className="secondary"
            disabled={busy || runsState.loading}
            onClick={runsState.retry}
          >
            Refresh run list
          </button>
        </div>

        {listState.loading || listState.error ? (
          <RemoteState state={listState} />
        ) : (
          <Table
            title="Run history and submission designation"
            rows={runs}
            rowKey="run_id"
            pageSize={8}
            columns={[
              {
                key: 'name',
                label: 'Run',

                render: (run) => (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    aria-pressed={
                      run.run_id === selectedRunId
                    }
                    onClick={() => onSelect(run.run_id)}
                  >
                    {run.name}
                    {run.run_id === selectedRunId
                      ? ' · Selected'
                      : ''}
                  </button>
                ),
              },
              {
                key: 'run_id',
                label: 'Run ID',

                render: (run) => (
                  <code className="id">
                    {run.run_id}
                  </code>
                ),
              },
              {
                key: 'status',
                label: 'Status',
              },
              {
                key: 'start_date',
                label: 'Day 1',
              },
              {
                key: 'completed_days',
                label: 'Days retained',

                render: (run) =>
                  `${number(run.completed_days)}/${run.simulation_days}`,
              },
              {
                key: 'duration_ms',
                label: 'Simulation time',

                render: (run) =>
                  Number.isFinite(run.duration_ms)
                    ? `${number(run.duration_ms / 1000, 2)} s`
                    : '—',
              },
              {
                key: 'is_submitted',
                label: 'Submission',

                render: (run) =>
                  run.is_submitted ? (
                    <span className="badge">
                      Submitted Run
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        busy ||
                        run.status !== 'completed'
                      }
                      onClick={() => submit(run.run_id)}
                    >
                      {pending?.type === 'submit' &&
                      pending.runId === run.run_id
                        ? 'Checking assurance…'
                        : 'Set as Submitted'}
                    </button>
                  ),
              },
            ]}
          />
        )}
      </Section>
    </>
  );
}