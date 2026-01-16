/**
 * Programmatic migration runner
 */
import { createLogger } from '@aztec/foundation/log';

import { runner } from 'node-pg-migrate';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface RunMigrationsOptions {
  /** Migration direction ('up' to apply, 'down' to rollback). Defaults to 'up'. */
  direction?: 'up' | 'down';
  /** Enable verbose output. Defaults to false. */
  verbose?: boolean;
}

/**
 * Run database migrations programmatically
 *
 * @param databaseUrl - PostgreSQL connection string
 * @param options - Migration options (direction, verbose)
 * @returns Array of applied migration names
 */
export async function runMigrations(databaseUrl: string, options: RunMigrationsOptions = {}): Promise<string[]> {
  const direction = options.direction ?? 'up';
  const verbose = options.verbose ?? false;

  const log = createLogger('validator-ha-signer:migrations');

  try {
    log.info(`Running migrations ${direction}...`);

    const appliedMigrations = await runner({
      databaseUrl,
      dir: join(__dirname, 'db', 'migrations'),
      direction,
      migrationsTable: 'pgmigrations',
      count: direction === 'down' ? 1 : Infinity,
      verbose,
      log: msg => (verbose ? log.info(msg) : log.debug(msg)),
    });

    if (appliedMigrations.length === 0) {
      log.info('No migrations to apply - schema is up to date');
    } else {
      log.info(`Applied ${appliedMigrations.length} migration(s)`, {
        migrations: appliedMigrations.map(m => m.name),
      });
    }

    return appliedMigrations.map(m => m.name);
  } catch (error: any) {
    log.error('Migration failed', error);
    throw error;
  }
}
