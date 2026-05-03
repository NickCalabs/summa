export type RecapReportType =
  | "net_worth"
  | "sheets_sections"
  | "assets_by_class"
  | "investable"
  | "cash_on_hand"
  | "crypto"
  | "brokerages"
  | "assets_by_tax";

export type RecapPeriod =
  | "today"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type RecapMode = "totals" | "allocation";

export interface RecapChange {
  absolute: number;
  percent: number;
}

export interface RecapGroupRow {
  key: string;
  label: string;
  assetType: string;
  assetIds: string[];
  expandable: boolean;
  parentKey: string | null;
  values: Record<string, number | null>;
  changes: Record<string, RecapChange | null>;
}

export interface RecapResponse {
  report: RecapReportType;
  period: RecapPeriod;
  mode: RecapMode;
  currency: string;
  columns: string[];
  groups: RecapGroupRow[];
  totals: Record<string, number>;
}

export const RECAP_REPORT_LABELS: Record<RecapReportType, string> = {
  net_worth: "Net Worth",
  sheets_sections: "Sheets & Sections",
  assets_by_class: "Assets x Class",
  investable: "Investable Assets",
  cash_on_hand: "Cash on Hand",
  crypto: "Crypto",
  brokerages: "Brokerages",
  assets_by_tax: "Assets x Taxability",
};

export const RECAP_PERIOD_LABELS: Record<RecapPeriod, string> = {
  today: "Today",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export const RECAP_MODE_LABELS: Record<RecapMode, string> = {
  totals: "Totals",
  allocation: "% Allocation",
};
