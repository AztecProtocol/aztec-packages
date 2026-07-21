/**
 * Add checkpoint_number column to validator_duties table
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('validator_duties', {
    // eslint-disable-next-line camelcase
    checkpoint_number: { type: 'bigint', notNull: true, default: 0 },
  });

  pgm.sql(`UPDATE schema_version SET version = 2 WHERE version = 1`);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn('validator_duties', 'checkpoint_number');

  pgm.sql(`UPDATE schema_version SET version = 1 WHERE version = 2`);
}
