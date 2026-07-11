import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index.js";
import path from "path";

export async function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "apps/server/drizzle");
  await migrate(db, { migrationsFolder });
  console.log("Database migrations applied");
}
