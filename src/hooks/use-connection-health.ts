import { useConnections, type ConnectionsData } from "./use-connections";

interface ConnectionHealth {
  staleCount: number;
  errorCount: number;
  isLoading: boolean;
}

function countByStatus(
  data: ConnectionsData | undefined,
): Pick<ConnectionHealth, "staleCount" | "errorCount"> {
  if (!data) return { staleCount: 0, errorCount: 0 };

  let staleCount = 0;
  let errorCount = 0;

  const allConnections = [
    ...data.wallets,
    ...data.plaid,
    ...data.simplefin,
    ...data.coinbase,
    ...data.priceFeeds,
  ];

  for (const conn of allConnections) {
    if (conn.status === "stale") staleCount++;
    if (conn.status === "error") errorCount++;
  }

  return { staleCount, errorCount };
}

export function useConnectionHealth(): ConnectionHealth {
  const { data, isLoading } = useConnections();
  const { staleCount, errorCount } = countByStatus(data);
  return { staleCount, errorCount, isLoading };
}
