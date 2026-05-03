export function getProviderLabel(providerType: string): string {
  switch (providerType) {
    case "plaid":
      return "Plaid synced";
    case "ticker":
      return "Ticker tracked";
    case "manual":
      return "Manual";
    default:
      return providerType;
  }
}
