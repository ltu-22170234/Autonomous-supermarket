import { useState } from 'react';
import { number } from '../services/format.js';

const empty = [];

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

export function Table({
  title = 'Records',
  rows = empty,
  columns = empty,
  pageSize = 12,
  rowKey = 'product_id',
}) {
  const [pagination, setPagination] = useState({ rows, title, page: 0 });
  const changed = rows !== pagination.rows || title !== pagination.title;

  // Reset with the changed inputs during render, before showing stale pages.
  if (changed) {
    setPagination({ rows, title, page: 0 });
  }

  const page = changed ? 0 : pagination.page;
  const setPage = (nextPage) => setPagination({ rows, title, page: nextPage });

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