import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SearchResult } from "@/lib/providers/types";

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function useTickerSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);
  return useQuery<SearchResult[]>({
    queryKey: ["ticker-search", debouncedQuery],
    queryFn: () =>
      fetch(
        `/api/prices/search?q=${encodeURIComponent(debouncedQuery)}`
      ).then((r) => r.json()),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
