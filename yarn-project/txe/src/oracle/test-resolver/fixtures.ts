/* eslint-disable camelcase */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type NamedValue, Option } from '@aztec/pxe/simulator';

import { TXE_ORACLE_REGISTRY } from '../txe_oracle_registry.js';

/**
 * Fixture definitions for oracle roundtrip tests.
 *
 * Each key is an oracle name from TXE_ORACLE_REGISTRY, and the value is an array of scenarios. The resolver selects a
 * scenario (by name for multi-scenario oracles, or automatically for single-scenario ones), verifies that the
 * deserialized inputs match the fixture's expected values, and returns the fixture output.
 *
 * To add a new oracle test:
 * 1. Add a fixture entry here with the expected inputs and output.
 * 2. Add a Noir `#[oracle_test]` function that calls the oracle with the same input values and asserts the output.
 */
export const ORACLE_TEST_FIXTURES: OracleTestFixtures = {
  aztec_avm_storageRead: [
    makeScenario({
      inputs: { slot: new Fr(10), contractAddress: AztecAddress.fromNumber(1) },
      output: new Fr(42),
    }),
  ],

  aztec_prv_getSenderForTags: [
    makeScenario({
      scenario: 'some',
      inputs: {},
      output: Option.some(AztecAddress.fromNumber(42)),
    }),
    makeScenario({
      scenario: 'none',
      inputs: {},
      output: Option.none(AztecAddress.ZERO),
    }),
  ],
};

/**
 * Converts a `NamedValue` tuple (from `deserializeParams`) to a record.
 * `[NamedValue<'slot', Fr>, NamedValue<'addr', AztecAddress>]` → `{ slot: Fr, addr: AztecAddress }`.
 */
type NamedValuesToRecord<T extends readonly NamedValue[]> = {
  [K in T[number] as K extends NamedValue<infer N, any> ? N : never]: K extends NamedValue<string, infer V> ? V : never;
};

/** Extracts the deserialized inputs record type from an oracle registry entry. */
type OracleInputs<K extends keyof typeof TXE_ORACLE_REGISTRY> = (typeof TXE_ORACLE_REGISTRY)[K] extends {
  deserializeParams(...args: any[]): infer P;
}
  ? P extends readonly NamedValue[]
    ? NamedValuesToRecord<P>
    : Record<string, never>
  : Record<string, never>;

/** Extracts the return type from an oracle registry entry's serializeReturn method. */
type OracleOutput<K extends keyof typeof TXE_ORACLE_REGISTRY> = (typeof TXE_ORACLE_REGISTRY)[K] extends {
  serializeReturn(result: infer R): any;
}
  ? R
  : void;

/** A single test scenario for an oracle, typed against the oracle registry. */
export interface OracleTestScenario<K extends keyof typeof TXE_ORACLE_REGISTRY = keyof typeof TXE_ORACLE_REGISTRY> {
  /** Scenario name for selection via `#[oracle_test("name")]`. Required when an oracle has multiple scenarios. */
  scenario?: string;
  /** Expected deserialized inputs. */
  inputs: OracleInputs<K>;
  /** Return value to serialize back to Noir. */
  output: OracleOutput<K>;
}

type OracleTestFixtures = {
  [K in keyof typeof TXE_ORACLE_REGISTRY]?: OracleTestScenario<K>[];
};

/** Creates a typed fixture scenario for a given oracle. */
function makeScenario<K extends keyof typeof TXE_ORACLE_REGISTRY>(
  scenario: OracleTestScenario<K>,
): OracleTestScenario<K> {
  return scenario;
}
