import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const migrationsFolder = path.join(__dirname, "../../drizzle");
  await migrate(db, { migrationsFolder });
  console.log("Database migrations applied");
}
