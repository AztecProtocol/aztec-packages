/**
 * Test helpers for database setup
 */
import type { PGlite } from '@electric-sql/pglite';

import { INSERT_SCHEMA_VERSION, SCHEMA_SETUP, SCHEMA_VERSION } from './schema.js';

/**
 * Set up the database schema for testing.
 * This runs the same SQL that migrations would apply.
 */
export async function setupTestSchema(pglite: PGlite): Promise<void> {
  for (const statement of SCHEMA_SETUP) {
    await pglite.query(statement);
  }
  await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
}
