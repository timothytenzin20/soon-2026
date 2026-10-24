/**
 * Apply migrations and seed the development organization, staff roles and fictional contractors.
 * Usage: pnpm db:seed   (reads DATABASE_URL from .env)
 */
import fs from "node:fs";
import path from "node:path";
import { createDb } from "@mb/db";
import { seedBase } from "@mb/pipeline";

const envFile = path.resolve(import.meta.dirname, "../.env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const h = createDb();
await h.migrate();
const { org, staff } = await seedBase(h.db);
console.log(`Seeded org "${org.name}" (${org.id}) with ${Object.keys(staff).length} staff accounts on ${h.driver}.`);
await h.close();
