import { useCallback, useEffect, useState } from 'react';
import { request } from '../services/api.js';

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
    if (!path) return;

    const controller = new AbortController();
    let active = true;

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

