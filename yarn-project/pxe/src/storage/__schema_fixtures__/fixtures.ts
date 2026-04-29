import {
  SERIALIZABLE_CONTRACT_CLASS_DATA_FIXTURE_TYPE_NAME,
  buildSerializableContractClassDataFixtures,
} from './serializable_contract_class_data_fixture.js';
import {
  SERIALIZABLE_CONTRACT_INSTANCE_FIXTURE_TYPE_NAME,
  buildSerializableContractInstanceFixtures,
} from './serializable_contract_instance_fixture.js';
import { STORED_NOTE_FIXTURE_TYPE_NAME, buildStoredNoteFixtures } from './stored_note_fixture.js';
import {
  STORED_PRIVATE_EVENT_FIXTURE_TYPE_NAME,
  buildStoredPrivateEventFixtures,
} from './stored_private_event_fixture.js';

/** A serializable instance produced by a schema fixture builder. */
export interface SchemaFixture {
  toBuffer(): Buffer;
}

/** Builds a list of canonical instances for one stored value-type. */
export type SchemaFixtureBuilder = () => SchemaFixture[];

/** Maps every PXE-defined stored value-type to its canonical fixture builder. */
export const SCHEMA_FIXTURES: ReadonlyMap<string, SchemaFixtureBuilder> = new Map<string, SchemaFixtureBuilder>([
  [STORED_NOTE_FIXTURE_TYPE_NAME, buildStoredNoteFixtures],
  [STORED_PRIVATE_EVENT_FIXTURE_TYPE_NAME, buildStoredPrivateEventFixtures],
  [SERIALIZABLE_CONTRACT_CLASS_DATA_FIXTURE_TYPE_NAME, buildSerializableContractClassDataFixtures],
  [SERIALIZABLE_CONTRACT_INSTANCE_FIXTURE_TYPE_NAME, buildSerializableContractInstanceFixtures],
]);
