import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { request } from '../services/api.js';

const empty = [];

const aud = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
});

function validNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

// Convert integer cents to an AUD display value.
export function money(cents) {
  return validNumber(cents)
    ? aud.format(Number(cents) / 100)
    : '—';
}

export function number(value, digits = 0) {
  if (!validNumber(value)) return '—';

  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

export function label(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

// Fetch read-only API data and support cancellation/retry.
export function useApi(path, revision = 0) {
  const [attempt, setAttempt] = useState(0);

  const key = JSON.stringify([path, revision, attempt]);

  const [state, setState] = useState({
    key: null,
    data: null,
    error: '',
    loading: Boolean(path),
  });

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!path) {
      setState({
        key,
        data: null,
        error: '',
        loading: false,
      });

      return;
    }

    const controller = new AbortController();
    let active = true;

    setState({
      key,
      data: null,
      error: '',
      loading: true,
    });

    request(path, { signal: controller.signal })
      .then((data) => {
        if (active) {
          setState({
            key,
            data,
            error: '',
            loading: false,
          });
        }
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') {
          setState({
            key,
            data: null,
            error: error.message,
            loading: false,
          });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [path, key]);

  // Prevent old data appearing under a newly selected run.
  const visible = state.key === key
    ? state
    : {
        data: null,
        error: '',
        loading: Boolean(path),
      };

  return {
    ...visible,
    retry,
  };
}

export function RemoteState({ state }) {
  if (state.loading) {
    return (
      <div className="empty" role="status">
        Loading…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="notice error" role="alert">
        <p>{state.error}</p>

        <button type="button" onClick={state.retry}>
          Try again
        </button>
      </div>
    );
  }

  return null;
}

export function Metric({ label: caption, value, note }) {
  return (
    <div className="metric">
      <span>{caption}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

export function Metrics({ items = empty }) {
  return (
    <div className="metrics">
      {items.map((item, index) => (
        <Metric
          key={`${item.label}-${index}`}
          {...item}
        />
      ))}
    </div>
  );
}

export function Section({ title, description, children }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>

      {children}
    </section>
  );
}

export function numericColumn(
  key,
  caption,
  format = number
) {
  return {
    key,
    label: caption,
    numeric: true,
    render: (row) => format(row[key]),
  };
}

export function Table({
  title = 'Records',
  rows = empty,
  columns = empty,
  pageSize = 12,
  rowKey = 'product_id',
}) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [rows, title]);

  const limit =
    Number.isInteger(pageSize) && pageSize > 0
      ? pageSize
      : 12;

  const pages = Math.max(
    1,
    Math.ceil(rows.length / limit)
  );

  const current = Math.min(page, pages - 1);
  const start = current * limit;

  return (
    <div className="data-table">
      <div className="table-wrap">
        <table>
          <caption>{title}</caption>

          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.numeric ? 'numeric' : ''}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows
              .slice(start, start + limit)
              .map((row, index) => (
                <tr
                  key={
                    typeof rowKey === 'function'
                      ? rowKey(row)
                      : row[rowKey] ?? `${current}-${index}`
                  }
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={
                        column.numeric ? 'numeric' : ''
                      }
                    >
                      {column.render
                        ? column.render(row)
                        : row[column.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, columns.length)}>
                  No records. Count: 0.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > limit && (
        <div className="pagination">
          <span>
            {number(start + 1)}–
            {number(Math.min(start + limit, rows.length))}
            {' '}of {number(rows.length)}
          </span>

          <div>
            <button
              type="button"
              className="secondary"
              aria-label={`Previous page of ${title}`}
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>

            <button
              type="button"
              className="secondary"
              aria-label={`Next page of ${title}`}
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Plot recorded customer counts without inventing extra data.
export function Trend({ days = empty, goDay }) {
  if (!days.length) {
    return <p className="empty">No daily records.</p>;
  }

  const width = 800;
  const height = 210;

  const max = Math.max(
    1,
    ...days.map((day) => day.customer_count)
  );

  const points = days.map((day, index) => ({
    ...day,

    x: 40 +
      index * (width - 60) /
      Math.max(1, days.length - 1),

    y: height - 25 -
      day.customer_count / max * (height - 50),
  }));

  const navigationDays = [...new Set([
    days[0].day,
    15,
    30,
    45,
    days.at(-1).day,
  ])].filter((day) =>
    days.some((record) => record.day === day)
  );

  return (
    <div className="trend">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Recorded customer visits by simulated day"
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
        }}
      >
        {[0, 0.5, 1].map((fraction) => {
          const y =
            height - 25 - fraction * (height - 50);

          return (
            <g key={fraction}>
              <line
                x1="40"
                x2="780"
                y1={y}
                y2={y}
                stroke="#dce7df"
              />

              <text
                x="2"
                y={y + 4}
                fontSize="12"
                fill="currentColor"
              >
                {number(
                  max * fraction,
                  max < 2 ? 1 : 0
                )}
              </text>
            </g>
          );
        })}

        <polyline
          fill="none"
          stroke="#216653"
          strokeWidth="2.5"
          points={points
            .map((point) => `${point.x},${point.y}`)
            .join(' ')}
        />

        {points.map((point) => (
          <circle
            key={point.day}
            cx={point.x}
            cy={point.y}
            r="3"
            fill="#216653"
          >
            <title>
              {`Day ${point.day}: ${point.customer_count} customers`}
            </title>
          </circle>
        ))}
      </svg>

      <div className="trend-days">
        {navigationDays.map((day) =>
          typeof goDay === 'function' ? (
            <button
              key={day}
              type="button"
              className="text-button"
              onClick={() => goDay(day)}
            >
              Day {day} ↗
            </button>
          ) : (
            <span key={day}>Day {day}</span>
          )
        )}
      </div>

      <p className="muted small">
        Customer visits include people who did not
        complete a purchase.
      </p>
    </div>
  );
}