import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Load data when a page opens (and again when `deps` change).
 * Gives back { data, loading, error, reload, setData }.
 * A request that finishes late (after a newer one started) is ignored, so old answers never overwrite new ones.
 */
export function useLoad(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latest = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++latest.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await fetcherRef.current();
      if (mine === latest.current) setData(result);
    } catch (err) {
      if (mine === latest.current) setError(err.message || "Could not load data");
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);

  return { data, loading, error, reload, setData };
}

/** A value that updates only after the person stops typing for `delay` ms. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Page title for the browser tab. */
export function useTitle(title) {
  useEffect(() => {
    document.title = `${title} | CareSlot`;
  }, [title]);
}
