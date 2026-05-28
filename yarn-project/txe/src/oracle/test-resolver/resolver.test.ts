/* eslint-disable camelcase */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/foundation/curves/bn254';
import { withoutHexPrefix } from '@aztec/foundation/string';
import { AZTEC_ADDRESS, FIELD, OPTION, Option, type OracleRegistryEntry, makeEntry } from '@aztec/pxe/simulator';

import type { OracleTestScenario } from './fixtures.js';
import { OracleTestResolver } from './resolver.js';

const TEST_REGISTRY: Record<string, OracleRegistryEntry> = {
  test_single: makeEntry({
    params: [
      { name: 'slot', type: FIELD },
      { name: 'addr', type: AZTEC_ADDRESS },
    ],
    returnType: FIELD,
  }),
  test_multi: makeEntry({
    params: [],
    returnType: OPTION(AZTEC_ADDRESS),
  }),
};

const TEST_FIXTURES: Record<string, OracleTestScenario[]> = {
  test_single: [{ inputs: { slot: new Fr(10), addr: AztecAddress.fromNumber(1) }, output: new Fr(42) }],
  test_multi: [
    { scenario: 'some', inputs: {}, output: Option.some(AztecAddress.fromNumber(7)) },
    { scenario: 'none', inputs: {}, output: Option.none(AztecAddress.ZERO) },
  ],
};

describe('OracleTestResolver', () => {
  let resolver: OracleTestResolver;

  beforeEach(() => {
    resolver = new OracleTestResolver(TEST_REGISTRY, TEST_FIXTURES);
  });

  it('resolves an oracle with a single fixture', async () => {
    const result = await callOracle('test_single', [toHex(new Fr(10)), toHex(AztecAddress.fromNumber(1))]);
    expect(result.values).toHaveLength(1);
    expect(result.values[0]).toBe(toHex(new Fr(42)));
  });

  it('resolves a named scenario', async () => {
    await setScenario('some', 10);
    const result = await callOracle('test_multi', [], 10);
    expect(result.values).toHaveLength(2);
    const isSome = toHex(new Fr(1));
    expect(result.values[0]).toBe(isSome);
  });

  it('resolves a different named scenario', async () => {
    await setScenario('none', 20);
    const result = await callOracle('test_multi', [], 20);
    expect(result.values).toHaveLength(2);
    const isNone = toHex(new Fr(0));
    expect(result.values[0]).toBe(isNone);
  });

  it('throws for unknown oracle', async () => {
    await expect(callOracle('nonexistent', [])).rejects.toThrow('not found in registry');
  });

  it('throws when multi-fixture oracle is called without scenario', async () => {
    await expect(callOracle('test_multi', [])).rejects.toThrow('Use #[oracle_test("scenario_name")] to select one');
  });

  it('throws when inputs do not match the fixture', async () => {
    await expect(callOracle('test_single', [toHex(new Fr(777)), toHex(AztecAddress.fromNumber(1))])).rejects.toThrow(
      'Input mismatch',
    );
  });

  it('throws for unknown named scenario', async () => {
    await setScenario('bogus', 30);
    await expect(callOracle('test_multi', [], 30)).rejects.toThrow("No scenario named 'bogus'");
  });

  it('tracks uncalled fixtures', async () => {
    expect(resolver.getUncalledFixtures()).toContain('test_single');

    await callOracle('test_single', [toHex(new Fr(10)), toHex(AztecAddress.fromNumber(1))]);

    expect(resolver.getUncalledFixtures()).not.toContain('test_single');
  });

  it('reports missing fixtures', () => {
    const missing = resolver.getMissingFixtures();
    expect(missing).toHaveLength(0);

    const partial = new OracleTestResolver(
      { ...TEST_REGISTRY, test_no_fixture: TEST_REGISTRY['test_single'] },
      TEST_FIXTURES,
    );
    expect(partial.getMissingFixtures()).toContain('test_no_fixture');
  });

  function callOracle(oracleName: string, inputs: (string | string[])[], sessionId = 1) {
    return resolver.resolve_foreign_call({
      session_id: sessionId,
      function: oracleName,
      root_path: '/tmp',
      package_name: 'test',
      inputs,
    });
  }

  function setScenario(name: string, sessionId: number) {
    const scenarioChars = Array.from(name).map(c => toHex(new Fr(c.charCodeAt(0))));
    return callOracle('aztec_oracle_test_set_scenario', [scenarioChars], sessionId);
  }

  function toHex(v: Fr | AztecAddress): string {
    return withoutHexPrefix(v.toString());
  }
});
