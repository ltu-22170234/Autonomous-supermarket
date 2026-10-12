const API_BASE = '/api';

// Shared JSON request helper.
export async function request(path, options = {}) {
  const {
    signal,
    timeoutMs = 30000,
    headers: suppliedHeaders,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();

  let timedOut = false;

  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener(
      'abort',
      abortFromCaller,
      { once: true }
    );
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const headers = new Headers(suppliedHeaders);

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    if (
      typeof fetchOptions.body === 'string' &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `The API returned an invalid JSON response (HTTP ${response.status}). Check the backend and API route.`,
        { cause: error }
      );
    }

    if (!response.ok) {
      const error = new Error(
        typeof data?.error === 'string'
          ? data.error
          : `Request failed with HTTP ${response.status}.`
      );

      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      if (timedOut) {
        throw new Error(
          'The request timed out. Check the backend; check the run list before repeating a run creation.',
          { cause: error }
        );
      }

      // Components can ignore requests they deliberately cancelled.
      throw error;
    }

    if (error instanceof TypeError) {
      throw new Error(
        'Could not connect to the API. Check that the backend is running.',
        { cause: error }
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

const runPath = (runId) =>
  `/runs/${encodeURIComponent(runId)}`;


// Backend readiness.
export async function fetchHealth(signal) {
  const data = await request('/health', { signal });

  if (data?.status !== 'ok') {
    throw new Error('The backend is not ready.');
  }

  return data;
}


// Draft model, or the saved model for a selected run.
export function fetchModel(signal, runId = null) {
  return request(
    runId ? `${runPath(runId)}/model` : '/model',
    { signal }
  );
}


// Current catalogue.
export function fetchProducts(signal) {
  return request('/products', { signal });
}


// List saved runs.
export function fetchRuns(signal) {
  return request('/runs', { signal });
}


// Create a separate 60-day run.
export function createRun(settings, signal) {
  return request('/runs', {
    method: 'POST',
    body: JSON.stringify(settings),
    signal,
  });
}


// Commercial report.
export function fetchReport(runId, signal) {
  return request(`${runPath(runId)}/report`, { signal });
}


// Reconciliation checks.
export function fetchAssurance(runId, signal) {
  return request(`${runPath(runId)}/assurance`, { signal });
}


// Daily report.
export function fetchDailyReport(runId, day, signal) {
  return request(
    `${runPath(runId)}/days/${encodeURIComponent(day)}`,
    { signal }
  );
}


// Product snapshot, daily inventory, batches, and events.
export function fetchProductHistory(runId, productId, signal) {
  return request(
    `${runPath(runId)}/products/${encodeURIComponent(productId)}`,
    { signal }
  );
}


// Transaction items and intended demand.
export function fetchTransactionDetail(
  runId,
  transactionId,
  signal
) {
  return request(
    `${runPath(runId)}/transactions/${encodeURIComponent(transactionId)}`,
    { signal }
  );
}


// Customer activity, including visits without a purchase.
export function fetchCustomerDetail(runId, customerId, signal) {
  return request(
    `${runPath(runId)}/customers/${encodeURIComponent(customerId)}`,
    { signal }
  );
}


// Select a completed run that passes assurance.
export function designateSubmitted(runId, signal) {
  return request(`${runPath(runId)}/submitted`, {
    method: 'POST',
    body: '{}',
    signal,
  });
}
