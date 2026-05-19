import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePollingOptions<T> {
  fetchFn: () => Promise<T>;
  interval?: number;
  enabled?: boolean;
  immediate?: boolean;
  deps?: unknown[];
}

export function usePolling<T>({
  fetchFn,
  interval = 4000,
  enabled = true,
  immediate = true,
  deps = [],
}: UsePollingOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const execute = useCallback(async () => {
    try {
      const result = await fetchRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    if (!enabled) return;
    setIsLoading(true);
    if (immediate) void execute();
    const id = setInterval(() => void execute(), interval);
    return () => clearInterval(id);
  }, [enabled, interval, immediate, execute, depsKey]);

  return { data, isLoading, error, refetch: execute };
}
