#!/usr/bin/env node
/**
 * Database migration runner
 *
 * Usage:
 *   ts-node migrate.ts up    # Run pending migrations
 *   ts-node migrate.ts down  # Rollback last migration
 */
import { runner } from 'node-pg-migrate';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const direction = process.argv[2] as 'up' | 'down';

  if (!direction || !['up', 'down'].includes(direction)) {
    console.error('Usage: migrate.ts [up|down]');
    process.exit(1);
  }

  try {
    console.log(`Running migrations ${direction}...`);

    await runner({
      databaseUrl,
      dir: join(__dirname, 'migrations'),
      direction,
      migrationsTable: 'pgmigrations',
      count: direction === 'down' ? 1 : Infinity,
      verbose: true,
      log: msg => console.log(msg),
    });

    console.log(`Migrations ${direction} completed successfully`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
