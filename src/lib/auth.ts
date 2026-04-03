import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.user);
          if (Number(result[0].count) > 0) {
            return false;
          }
        },
      },
    },
  },
  user: {
    additionalFields: {
      defaultCurrency: {
        type: "string",
        defaultValue: "USD",
        required: false,
        input: true,
      },
    },
  },
});
