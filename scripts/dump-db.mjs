/**
 * dump-db.mjs
 * Generates a MySQL-compatible SQL dump of all baby-tracker tables.
 * Run: node scripts/dump-db.mjs
 */

import { createConnection } from "mysql2/promise";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse mysql2 connection string
const url = new URL(DATABASE_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

const tables = [
  "users",
  "feeding_sessions",
  "diaper_changes",
  "telegram_settings",
];

const lines = [];
lines.push("-- Baby Tracker SQL Dump");
lines.push(`-- Generated: ${new Date().toISOString()}`);
lines.push("-- MySQL 8.0 compatible");
lines.push("");
lines.push("SET FOREIGN_KEY_CHECKS=0;");
lines.push("SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';");
lines.push("SET NAMES utf8mb4;");
lines.push("");

for (const table of tables) {
  console.log(`Dumping ${table}...`);

  // Get CREATE TABLE
  const [[createRow]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
  const createSql = createRow["Create Table"];
  lines.push(`-- ----------------------------`);
  lines.push(`-- Table: ${table}`);
  lines.push(`-- ----------------------------`);
  lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
  lines.push(createSql + ";");
  lines.push("");

  // Get all rows
  const [rows] = await conn.query(`SELECT * FROM \`${table}\` ORDER BY id`);
  if (rows.length === 0) {
    lines.push(`-- (no data)`);
    lines.push("");
    continue;
  }

  // Get column names
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `\`${c}\``).join(", ");

  lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES`);

  const valueRows = rows.map((row, i) => {
    const vals = cols.map((col) => {
      const v = row[col];
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number" || typeof v === "bigint") return String(v);
      if (v instanceof Date) return `'${v.toISOString().replace("T", " ").replace("Z", "")}'`;
      // Escape string
      return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r")}'`;
    });
    const suffix = i < rows.length - 1 ? "," : ";";
    return `  (${vals.join(", ")})${suffix}`;
  });

  lines.push(...valueRows);
  lines.push("");
}

lines.push("SET FOREIGN_KEY_CHECKS=1;");
lines.push("");

await conn.end();

const output = lines.join("\n");
const outPath = resolve(__dirname, "../baby-tracker-dump.sql");
writeFileSync(outPath, output, "utf8");
console.log(`\nDump written to: ${outPath}`);
console.log(`Size: ${(output.length / 1024).toFixed(1)} KB`);
