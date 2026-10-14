const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Do not run the development schema setup against production. Publish the development schema instead.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const schema = await fs.readFile(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
    await pool.query(schema);
    console.log("Database schema is ready.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
