import { useQuery } from "@tanstack/react-query";

export function useExchangeRates(base: string) {
  return useQuery<{ base: string; rates: Record<string, number> }>({
    queryKey: ["exchange-rates", base],
    queryFn: async () => {
      const res = await fetch(`/api/exchange-rates?base=${encodeURIComponent(base)}`);
      if (!res.ok) throw new Error("Failed to fetch exchange rates");
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
