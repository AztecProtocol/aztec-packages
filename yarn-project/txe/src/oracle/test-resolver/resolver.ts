/* eslint-disable camelcase */
import type { Logger } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import { withHexPrefix, withoutHexPrefix } from '@aztec/foundation/string';
import type { InputSlot, OracleRegistryEntry } from '@aztec/pxe/simulator';

import type { ForeignCallArgs, ForeignCallResult } from '../../utils/encoding.js';
import type { OracleTestScenario } from './fixtures.js';

/** Name of the meta-oracle that Noir tests call to select a fixture scenario by name. */
const SET_SCENARIO_ORACLE = 'aztec_oracle_test_set_scenario';

export type OracleTestCallInput = {
  session_id: number;
  function: string;
  root_path: string;
  package_name: string;
  inputs: ForeignCallArgs;
};

/**
 * Oracle resolver for roundtrip tests. Selects a fixture scenario, verifies that the received inputs match, and
 * returns the corresponding fixture output.
 *
 * For oracles with a single fixture, it is selected automatically. For oracles with multiple fixtures, Noir tests
 * must call the `oracle_test_set_scenario` meta-oracle to select a specific scenario by name before calling the
 * real oracle.
 */
export class OracleTestResolver {
  private readonly calledOracles = new Set<string>();
  private readonly pendingScenario = new Map<number, string>();
  private readonly logger: Logger;

  constructor(
    private readonly registry: Record<string, OracleRegistryEntry>,
    private readonly fixtures: Partial<Record<string, OracleTestScenario[]>>,
    logger?: Logger,
  ) {
    this.logger = logger ?? createLogger('txe:test-resolver');
  }

  // eslint-disable-next-line require-await
  async resolve_foreign_call(callData: OracleTestCallInput): Promise<ForeignCallResult> {
    const oracleName = callData.function;
    this.logger.debug('Resolving oracle', { oracleName });

    if (oracleName === SET_SCENARIO_ORACLE) {
      return this.#handleSetScenario(callData);
    }

    this.calledOracles.add(oracleName);

    if (!(oracleName in this.registry)) {
      throw new Error(`Oracle '${oracleName}' not found in registry`);
    }
    const entry = this.registry[oracleName];

    const scenarios = this.fixtures[oracleName];
    if (!scenarios || scenarios.length === 0) {
      throw new Error(`No fixture defined for oracle '${oracleName}'`);
    }

    const match = this.#selectScenario(callData.session_id, oracleName, scenarios);
    this.#verifyInputs(callData.inputs, entry, match, oracleName);

    this.logger.debug('Verified scenario for oracle', { oracleName });

    const outputSlots = entry.serializeReturn(match.output);
    return {
      values: outputSlots.map(slot => (Array.isArray(slot) ? slot.map(withoutHexPrefix) : withoutHexPrefix(slot))),
    };
  }

  /** Returns oracles that have a fixture defined but were never called during testing. */
  getUncalledFixtures(): string[] {
    return Object.keys(this.fixtures).filter(name => !this.calledOracles.has(name));
  }

  /** Returns oracles in the registry that have no fixture defined at all. */
  getMissingFixtures(): string[] {
    return Object.keys(this.registry).filter(name => !(name in this.fixtures));
  }

  #handleSetScenario(callData: { session_id: number; inputs: ForeignCallArgs }): ForeignCallResult {
    const charCodes = callData.inputs[0] as string[];
    const scenarioName = charCodes
      .map(hex => Number(BigInt(hex.startsWith('0x') ? hex : `0x${hex}`)))
      .map(code => String.fromCharCode(code))
      .join('');

    this.logger.debug('Setting scenario for next oracle call', { sessionId: callData.session_id, scenarioName });
    this.pendingScenario.set(callData.session_id, scenarioName);

    return { values: [] };
  }

  /** Selects a scenario by pending name (for multi-fixture oracles) or returns the single fixture. */
  #selectScenario(sessionId: number, oracleName: string, fixtures: OracleTestScenario[]): OracleTestScenario {
    const selectedName = this.pendingScenario.get(sessionId);

    if (selectedName !== undefined) {
      this.pendingScenario.delete(sessionId);
      const matches = fixtures.filter(s => s.scenario === selectedName);
      if (matches.length === 0) {
        const available = fixtures.map(s => s.scenario).join(', ');
        throw new Error(`No scenario named '${selectedName}' for oracle '${oracleName}'. Available: ${available}`);
      }
      if (matches.length > 1) {
        throw new Error(`Duplicate scenario name '${selectedName}' for oracle '${oracleName}'`);
      }
      return matches[0];
    }

    if (fixtures.length === 1) {
      return fixtures[0];
    }

    throw new Error(
      `Oracle '${oracleName}' has ${fixtures.length} fixture scenarios. ` +
        `Use #[oracle_test("scenario_name")] to select one.`,
    );
  }

  /** Deserializes actual inputs and verifies they match the scenario's expected inputs. */
  #verifyInputs(
    rawInputs: ForeignCallArgs,
    entry: OracleRegistryEntry,
    scenario: OracleTestScenario,
    oracleName: string,
  ): void {
    const expectedInputs = scenario.inputs as Record<string, unknown>;
    if (Object.keys(expectedInputs).length === 0) {
      return;
    }

    const normalized: InputSlot[] = rawInputs.map(v =>
      Array.isArray(v) ? (v as string[]).map(withHexPrefix) : [withHexPrefix(v as string)],
    );
    const named = entry.deserializeParams(normalized);

    for (const param of named) {
      if (!(param.name in expectedInputs)) {
        throw new Error(
          `Unexpected param '${param.name}' for oracle '${oracleName}'. ` +
            `Expected: ${Object.keys(expectedInputs).join(', ')}`,
        );
      }
      if (!valuesEqual(param.value, expectedInputs[param.name])) {
        const scenarioLabel = scenario.scenario ? ` (scenario '${scenario.scenario}')` : '';
        throw new Error(
          `Input mismatch for oracle '${oracleName}'${scenarioLabel}: ` +
            `param '${param.name}' expected ${String(expectedInputs[param.name])} ` +
            `but got ${String(param.value)}`,
        );
      }
    }
  }
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((v, i) => valuesEqual(v, expected[i]));
  }
  return String(actual) === String(expected);
}
