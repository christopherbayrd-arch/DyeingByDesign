import { neon } from "@neondatabase/serverless";

// Returns a Neon SQL client, or null if DATABASE_URL isn't set yet.
// Every caller handles the null case so the site still works
// before the database is hooked up.
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}
