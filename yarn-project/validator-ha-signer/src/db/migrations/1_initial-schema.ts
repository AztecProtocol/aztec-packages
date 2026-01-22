/**
 * Initial schema for validator HA slashing protection
 *
 * This migration imports SQL from the schema.ts file to ensure a single source of truth.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

import { DROP_SCHEMA_VERSION_TABLE, DROP_VALIDATOR_DUTIES_TABLE, SCHEMA_SETUP, SCHEMA_VERSION } from '../schema.js';

export function up(pgm: MigrationBuilder): void {
  for (const statement of SCHEMA_SETUP) {
    pgm.sql(statement);
  }

  // Insert initial schema version
  pgm.sql(`
    INSERT INTO schema_version (version)
    VALUES (${SCHEMA_VERSION})
    ON CONFLICT (version) DO NOTHING;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(DROP_VALIDATOR_DUTIES_TABLE);
  pgm.sql(DROP_SCHEMA_VERSION_TABLE);
}
