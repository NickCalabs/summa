import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  pgEnum,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Enums ──

export const sheetTypeEnum = pgEnum("sheet_type", ["assets", "debts"]);
export const providerTypeEnum = pgEnum("provider_type", [
  "manual",
  "ticker",
  "wallet",
  "exchange",
  "simplefin",
  "snaptrade",
  "zillow",
  "vin",
  "custom",
  "plaid",
]);
export const snapshotSourceEnum = pgEnum("snapshot_source", [
  "provider",
  "manual",
  "import",
]);
export const taxStatusEnum = pgEnum("tax_status", [
  "taxable",
  "tax_deferred",
  "tax_free",
]);

// ── Users (Better Auth manages this table) ──
// Better Auth creates: user, session, account, verification tables.
// We extend the user table with `defaultCurrency` via `additionalFields`.
// The schema below is for Drizzle awareness / seed script only.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Portfolios ──

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  startDate: date("start_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Sheets ──

export const sheets = pgTable("sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: sheetTypeEnum("type").notNull().default("assets"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Sections ──

export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  sheetId: uuid("sheet_id")
    .notNull()
    .references(() => sheets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Assets ──

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => sections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("other"),
  sortOrder: integer("sort_order").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  quantity: numeric("quantity", { precision: 20, scale: 8 }),
  costBasis: numeric("cost_basis", { precision: 20, scale: 2 }),
  currentValue: numeric("current_value", { precision: 20, scale: 2 })
    .notNull()
    .default("0"),
  currentPrice: numeric("current_price", { precision: 20, scale: 8 }),
  isInvestable: boolean("is_investable").notNull().default(true),
  isCashEquivalent: boolean("is_cash_equivalent").notNull().default(false),
  providerType: providerTypeEnum("provider_type").notNull().default("manual"),
  providerConfig: jsonb("provider_config")
    .$type<{
      ticker?: string;
      exchange?: string;
      source?: string;
      walletAddress?: string;
      connectionId?: string;
      plaidAccountId?: string;
      simplefinAccountId?: string;
    }>()
    .default({}),
  ownershipPct: numeric("ownership_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("100"),
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  isArchived: boolean("is_archived").notNull().default(false),
  staleDays: integer("stale_days"),
  taxStatus: taxStatusEnum("tax_status"),
  linkedDebtId: uuid("linked_debt_id"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Asset Snapshots ──

export const assetSnapshots = pgTable(
  "asset_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    value: numeric("value", { precision: 20, scale: 2 }).notNull(),
    valueInBase: numeric("value_in_base", { precision: 20, scale: 2 }).notNull(),
    price: numeric("price", { precision: 20, scale: 8 }),
    quantity: numeric("quantity", { precision: 20, scale: 8 }),
    source: snapshotSourceEnum("source").notNull().default("provider"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("asset_snapshot_unique").on(table.assetId, table.date),
  ]
);

// ── Portfolio Snapshots ──

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalAssets: numeric("total_assets", { precision: 20, scale: 2 }).notNull(),
    totalDebts: numeric("total_debts", { precision: 20, scale: 2 }).notNull(),
    netWorth: numeric("net_worth", { precision: 20, scale: 2 }).notNull(),
    cashOnHand: numeric("cash_on_hand", { precision: 20, scale: 2 }).notNull(),
    investableTotal: numeric("investable_total", { precision: 20, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("portfolio_snapshot_unique").on(table.portfolioId, table.date),
  ]
);

// ── Plaid Connections ──

export const plaidConnections = pgTable("plaid_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  institutionId: text("institution_id").notNull(),
  institutionName: text("institution_name").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  itemId: text("item_id").notNull().unique(),
  consentExpiration: timestamp("consent_expiration"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  errorExpiresAt: timestamp("error_expires_at"),
  errorRetryCount: integer("error_retry_count").notNull().default(0),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Plaid Accounts ──

export const plaidAccounts = pgTable("plaid_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => plaidConnections.id, { onDelete: "cascade" }),
  plaidAccountId: text("plaid_account_id").notNull().unique(),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  officialName: text("official_name"),
  type: text("type").notNull(),
  subtype: text("subtype"),
  mask: text("mask"),
  currentBalance: numeric("current_balance", { precision: 20, scale: 2 }),
  availableBalance: numeric("available_balance", { precision: 20, scale: 2 }),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  isTracked: boolean("is_tracked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── SimpleFIN Connections ──

export const simplefinConnections = pgTable("simplefin_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  serverUrl: text("server_url").notNull(),
  label: text("label").notNull().default("SimpleFIN"),
  accessUrlEnc: text("access_url_enc").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── SimpleFIN Accounts ──

export const simplefinAccounts = pgTable(
  "simplefin_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => simplefinConnections.id, { onDelete: "cascade" }),
    simplefinAccountId: text("simplefin_account_id").notNull(),
    assetId: uuid("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    connectionName: text("connection_name"),
    institutionName: text("institution_name"),
    accountName: text("account_name").notNull(),
    currency: text("currency").notNull().default("USD"),
    balance: numeric("balance", { precision: 20, scale: 2 }),
    availableBalance: numeric("available_balance", { precision: 20, scale: 2 }),
    balanceDate: timestamp("balance_date"),
    isTracked: boolean("is_tracked").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("simplefin_account_connection_unique").on(
      table.connectionId,
      table.simplefinAccountId
    ),
  ]
);

// ── Transactions ──

export const transactionTypeEnum = pgEnum("transaction_type", [
  "buy",
  "sell",
  "deposit",
  "withdraw",
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }),
  price: numeric("price", { precision: 20, scale: 8 }),
  total: numeric("total", { precision: 20, scale: 2 }).notNull(),
  commission: numeric("commission", { precision: 20, scale: 2 }),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Plaid Webhook Events (idempotency log) ──

export const plaidWebhookEvents = pgTable(
  "plaid_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: text("item_id").notNull(),
    webhookType: text("webhook_type").notNull(),
    webhookCode: text("webhook_code").notNull(),
    webhookIat: integer("webhook_iat").notNull(),
    processedAt: timestamp("processed_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("plaid_webhook_event_key_idx").on(
      table.itemId,
      table.webhookType,
      table.webhookCode,
      table.webhookIat
    ),
  ]
);

// ── Exchange Rates ──

export const exchangeRates = pgTable("exchange_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  base: text("base").notNull(),
  rates: jsonb("rates").$type<Record<string, number>>().notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("exchange_rates_base_unique").on(table.base),
]);
