import { useEffect, useRef, useState } from 'react';

import AuditModal from './components/AuditModal.jsx';
import Catalogue from './components/Catalogue.jsx';
import ModelDeclaration from './components/ModelDeclaration.jsx';
import Reports from './components/Reports.jsx';
import RunManager from './components/RunManager.jsx';
import { RemoteState } from './components/ui.jsx';
import { useApi } from './hooks/useApi.js';

const pages = [
  ['model-declaration', 'Model Declaration'],
  ['commercial-report', 'Commercial Report'],
  ['catalogue', 'Catalogue'],
];

function currentPage() {
  const page = window.location.hash.slice(1);
  return pages.some(([id]) => id === page) ? page : 'model-declaration';
}

export default function App() {
  const [navigation, setNavigation] = useState(() => {
    const page = currentPage();
    return { page, visited: [page] };
  });
  const { page, visited } = navigation;
  const pageTitle = pages.find(([id]) => id === page)[1];
  const pageHeading = useRef(null);
  const previousPage = useRef(page);
  const runControls = useRef(null);
  const [auditTarget, setAuditTarget] = useState(null);

  useEffect(() => {
    function handleNavigation() {
      const nextPage = currentPage();
      setNavigation((current) => {
        if (current.page === nextPage) return current;

        return {
          page: nextPage,
          visited: current.visited.includes(nextPage)
            ? current.visited
            : [...current.visited, nextPage],
        };
      });
      setAuditTarget(null);
    }

    window.addEventListener('hashchange', handleNavigation);
    return () => window.removeEventListener('hashchange', handleNavigation);
  }, []);

  useEffect(() => {
    document.title = `${pageTitle} | Supermarket Simulator`;

    if (previousPage.current !== page) {
      if (runControls.current) runControls.current.open = false;
      pageHeading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      previousPage.current = page;
    }
  }, [page, pageTitle]);

  const health = useApi('/health');
  const modelState = useApi('/model');
  const [runRevision, setRunRevision] = useState(0);
  const fetchedRunsState = useApi('/runs', runRevision);
  const runsState =
    !fetchedRunsState.loading &&
    !fetchedRunsState.error &&
    !Array.isArray(fetchedRunsState.data)
      ? {
          ...fetchedRunsState,
          error: 'The run list response should be an array.',
        }
      : fetchedRunsState;
  // undefined: choose the Submitted Run or latest completed run.
  // null: explicitly display the draft model.
  const [selectedRunId, setSelectedRunId] = useState(undefined);

  const runs = Array.isArray(runsState.data) ? runsState.data : [];
  const defaultRun =
    runs.find((run) => run.is_submitted) ??
    runs.find((run) => run.status === 'completed');
  const activeRunId =
    selectedRunId === undefined
      ? defaultRun?.run_id ?? null
      : selectedRunId;
  const selectedRun = runs.find((run) => run.run_id === activeRunId);
  const resolvingDefaultRun =
    selectedRunId === undefined &&
    activeRunId === null &&
    (runsState.loading || runsState.error);
  const configuration = modelState.data?.configuration;
  const modelReady = Boolean(
    configuration?.scenario && configuration?.customers?.basePerDay
  );

  function openAudit(type, id) {
    if (page !== 'commercial-report' || !activeRunId || id == null) return;

    setAuditTarget({ runId: activeRunId, type, id });
  }

  function selectRun(runId) {
    setAuditTarget(null);
    setSelectedRunId(runId);
  }

  function selectAndRefresh(runId) {
    selectRun(runId);
    setRunRevision((value) => value + 1);
  }

  return (
    <>
      <a
        className="skip-link"
        href="#page-title"
        onClick={(event) => {
          // Keep this accessibility anchor out of the page routing hash.
          event.preventDefault();
          pageHeading.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-brand" href="#model-declaration">
            Supermarket Simulator
          </a>
          <nav className="site-navigation" aria-label="Main navigation">
            {pages.map(([id, title]) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={page === id ? 'page' : undefined}
              >
                {title}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main aria-labelledby="page-title">
        <h1 id="page-title" ref={pageHeading} tabIndex={-1}>
          {pageTitle}
        </h1>

        {health.loading || health.error ? (
          <RemoteState state={health} />
        ) : (
          <p>{health.data?.message}</p>
        )}

        {!resolvingDefaultRun && (
          <p className="muted">
            Selected run: <strong>{selectedRun?.name ?? activeRunId ?? 'Draft model'}</strong>
          </p>
        )}

        <details className="run-controls" ref={runControls}>
          <summary>Create or select a simulation run</summary>
          {modelState.loading || modelState.error ? (
            <RemoteState state={modelState} />
          ) : modelReady ? (
            <RunManager
              configuration={configuration}
              runsState={runsState}
              selectedRunId={activeRunId}
              onSelect={selectRun}
              onCreated={selectAndRefresh}
              onSubmitted={selectAndRefresh}
            />
          ) : (
            <RemoteState
              state={{
                ...modelState,
                loading: false,
                error: 'The draft model configuration is missing.',
              }}
            />
          )}
        </details>

        {/* Mount pages on their first visit, then retain forms and report choices. */}
        {visited.includes('model-declaration') && (
          <div className="page-content" hidden={page !== 'model-declaration'}>
            {resolvingDefaultRun ? (
              <RemoteState state={runsState} />
            ) : (
              <ModelDeclaration runId={activeRunId} />
            )}
          </div>
        )}
        {visited.includes('commercial-report') && (
          <div className="page-content" hidden={page !== 'commercial-report'}>
            {resolvingDefaultRun ? (
              <RemoteState state={runsState} />
            ) : (
              <Reports
                key={activeRunId ?? 'draft'}
                runId={activeRunId}
                revision={runRevision}
                openProduct={(id) => openAudit('product', id)}
                openTransaction={(id) => openAudit('transaction', id)}
                openCustomer={(id) => openAudit('customer', id)}
              />
            )}
          </div>
        )}
        {visited.includes('catalogue') && (
          <div className="page-content" hidden={page !== 'catalogue'}>
            <Catalogue />
          </div>
        )}

        {page === 'commercial-report' && auditTarget && auditTarget.runId === activeRunId && (
          <AuditModal
            key={[auditTarget.runId, auditTarget.type, auditTarget.id].join(':')}
            runId={auditTarget.runId}
            target={auditTarget}
            onClose={() => setAuditTarget(null)}
            openProduct={(id) => openAudit('product', id)}
            openTransaction={(id) => openAudit('transaction', id)}
            openCustomer={(id) => openAudit('customer', id)}
          />
        )}
      </main>
    </>
  );
}
