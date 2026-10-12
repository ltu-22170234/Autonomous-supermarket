import { useState } from 'react';

import Catalogue from './components/Catalogue.jsx';
import ModelDeclaration from './components/ModelDeclaration.jsx';
import RunManager from './components/RunManager.jsx';

import {
  useApi,
  RemoteState,
} from './components/ui.jsx';
import Reports from './components/Reports.jsx';
import AuditModal from './components/AuditModal.jsx';
export default function App() {
  const health = useApi('/health');
  const modelState = useApi('/model');

  const [runRevision, setRunRevision] = useState(0);
  const runsState = useApi('/runs', runRevision);
  const [auditTarget, setAuditTarget] = useState(null);
  // undefined: choose the Submitted Run or latest completed run.
  // null: explicitly display the draft model.
  const [selectedRunId, setSelectedRunId] = useState(undefined);

  const runs = Array.isArray(runsState.data)
    ? runsState.data
    : [];

  const defaultRun =
    runs.find((run) => run.is_submitted) ??
    runs.find((run) => run.status === 'completed');

  const activeRunId =
    selectedRunId === undefined
      ? defaultRun?.run_id ?? null
      : selectedRunId;

  const configuration = modelState.data?.configuration;

  const modelReady = Boolean(
    configuration?.scenario &&
    configuration?.customers?.basePerDay
  );

  function openAudit(type, id) {
  if (!activeRunId || id === null || id === undefined) return;

  setAuditTarget({
    runId: activeRunId,
    type,
    id,
  });
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
    <main>
      <h1>Supermarket Simulator</h1>

      {health.loading || health.error ? (
        <RemoteState state={health} />
      ) : (
        <p>{health.data.message}</p>
      )}

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

      {runsState.loading && activeRunId === null ? (
        <RemoteState state={runsState} />
      ) : (
        <ModelDeclaration runId={activeRunId} />
      )}
      <Reports
          key={activeRunId ?? 'draft'}
          runId={activeRunId}
          revision={runRevision}
          openProduct={(id) => openAudit('product', id)}
          openTransaction={(id) => openAudit('transaction', id)}
          openCustomer={(id) => openAudit('customer', id)}
        />

        {auditTarget && auditTarget.runId === activeRunId && (
          <AuditModal
            key={[
              auditTarget.runId,
              auditTarget.type,
              auditTarget.id,
            ].join(':')}
            runId={auditTarget.runId}
            target={auditTarget}
            onClose={() => setAuditTarget(null)}
            openProduct={(id) => openAudit('product', id)}
            openTransaction={(id) => openAudit('transaction', id)}
            openCustomer={(id) => openAudit('customer', id)}
          />
        )}

      <Catalogue />
    </main>
  );
}