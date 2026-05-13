import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "postgres://evalops:evalops@127.0.0.1:5432/evalops";

const queryClient = postgres(connectionString, {
  max: Number(process.env.DB_POOL_SIZE ?? 10),
  idle_timeout: 20,
  connect_timeout: 10
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;

export const closeDb = async () => {
  await queryClient.end({ timeout: 5 });
};
