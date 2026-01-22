import type { Logger } from '@aztec/foundation/log';
import { runMigrations } from '@aztec/validator-ha-signer/migrations';

import type { Command } from 'commander';

export function injectMigrateCommand(program: Command, log: (msg: string) => void, debugLogger: Logger): Command {
  const migrateCommand = program.command('migrate-ha-db').description('Run validator-ha-signer database migrations');

  migrateCommand
    .command('up')
    .description('Apply pending migrations')
    .requiredOption('--database-url <string>', 'PostgreSQL connection string', process.env.DATABASE_URL)
    .option('--verbose', 'Enable verbose output', false)
    .action(async options => {
      const migrations = await runMigrations(options.databaseUrl, debugLogger, {
        direction: 'up',
        verbose: options.verbose,
      });
      if (migrations.length > 0) {
        log(`Applied migrations: ${migrations.join(', ')}`);
      } else {
        log('No migrations to apply - schema is up to date');
      }
    });

  migrateCommand
    .command('down')
    .description('Rollback the last migration')
    .requiredOption('--database-url <string>', 'PostgreSQL connection string', process.env.DATABASE_URL)
    .option('--verbose', 'Enable verbose output', false)
    .action(async options => {
      const migrations = await runMigrations(options.databaseUrl, debugLogger, {
        direction: 'down',
        verbose: options.verbose,
      });
      if (migrations.length > 0) {
        log(`Rolled back migrations: ${migrations.join(', ')}`);
      } else {
        log('No migrations to rollback');
      }
    });

  return program;
}
