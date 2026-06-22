/* eslint-disable camelcase */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/foundation/curves/bn254';
import { withoutHexPrefix } from '@aztec/foundation/string';
import {
  AZTEC_ADDRESS,
  BoundedVec,
  FIELD,
  OPTION,
  Option,
  type OracleRegistryEntry,
  makeEntry,
} from '@aztec/pxe/simulator';

import { OracleTestResolver, type OracleTestScenario, SET_SCENARIO_ENTRY } from './resolver.js';

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
  test_labeled: makeEntry({
    params: [{ name: 'slot', type: FIELD }],
    returnType: OPTION(FIELD),
  }),
  test_both_option: makeEntry({
    params: [{ name: 'p', type: OPTION(FIELD) }],
    returnType: OPTION(FIELD),
  }),
};

const TEST_FIXTURES: Record<string, OracleTestScenario[]> = {
  test_single: [{ inputs: { slot: new Fr(10), addr: AztecAddress.fromNumberUnsafe(1) }, output: new Fr(42) }],
  test_multi: [
    { scenario: 'some', inputs: {}, output: Option.some(AztecAddress.fromNumberUnsafe(7)) },
    { scenario: 'none', inputs: {}, output: Option.none(AztecAddress.ZERO) },
  ],
  test_labeled: [
    { scenario: 'some', inputs: { slot: new Fr(10) }, output: Option.some(new Fr(1)) },
    { scenario: 'none', inputs: { slot: new Fr(10) }, output: Option.none(new Fr(0)) },
  ],
  test_both_option: [
    { scenario: 'some+some', inputs: { p: Option.some(new Fr(10)) }, output: Option.some(new Fr(20)) },
    { scenario: 'none+none', inputs: { p: Option.none(new Fr(0)) }, output: Option.none(new Fr(0)) },
  ],
};

describe('OracleTestResolver', () => {
  let resolver: OracleTestResolver;

  beforeEach(() => {
    resolver = new OracleTestResolver(TEST_REGISTRY, TEST_FIXTURES);
  });

  it('resolves an oracle with a single scenario', async () => {
    const result = await callOracle('test_single', [toHex(new Fr(10)), toHex(AztecAddress.fromNumberUnsafe(1))]);
    expect(result.values).toHaveLength(1);
    expect(result.values[0]).toBe(toHex(new Fr(42)));
  });

  it('resolves a scenario (some)', async () => {
    await setScenario('some', 10);
    const result = await callOracle('test_multi', [], 10);
    expect(result.values).toHaveLength(2);
    const isSome = toHex(new Fr(1));
    expect(result.values[0]).toBe(isSome);
  });

  it('resolves a different scenario (none)', async () => {
    await setScenario('none', 20);
    const result = await callOracle('test_multi', [], 20);
    expect(result.values).toHaveLength(2);
    const isNone = toHex(new Fr(0));
    expect(result.values[0]).toBe(isNone);
  });

  it('throws for unknown oracle', async () => {
    await expect(callOracle('nonexistent', [])).rejects.toThrow('not found in registry');
  });

  it('throws when a multi-scenario oracle is called without announcing a scenario', async () => {
    await expect(callOracle('test_multi', [])).rejects.toThrow('none was announced');
  });

  it('throws when inputs do not match the fixture', async () => {
    await expect(
      callOracle('test_single', [toHex(new Fr(777)), toHex(AztecAddress.fromNumberUnsafe(1))]),
    ).rejects.toThrow('Input mismatch');
  });

  it('labels the input-mismatch error with the scenario name', async () => {
    await setScenario('some', 40);
    const expected =
      `Input mismatch for oracle 'test_labeled' (scenario 'some'): param 'slot' ` +
      `expected ${new Fr(10)} but got ${new Fr(777)}. ` +
      `If you changed this oracle, consider bumping the PXE oracle version in yarn-project/pxe/src/oracle_version.ts.`;
    await expect(callOracle('test_labeled', [toHex(new Fr(777))], 40)).rejects.toThrow(expected);
  });

  it('throws for an unknown scenario', async () => {
    await setScenario('bogus', 30);
    await expect(callOracle('test_multi', [], 30)).rejects.toThrow("No scenario 'bogus'");
  });

  it('accumulates two announces for a both-Option oracle (param + return)', async () => {
    // Both the param and the return are multi-scenario, so the macro announces twice; the resolver joins the
    // announcements with `+` (some+some / none+none) and selects the matching fixture.
    await setScenario('some', 50); // param announce
    await setScenario('some', 50); // return announce
    const some = await callOracle('test_both_option', [toHex(new Fr(1)), toHex(new Fr(10))], 50);
    expect(some.values).toEqual([toHex(new Fr(1)), toHex(new Fr(20))]); // Option::some(20)

    await setScenario('none', 51);
    await setScenario('none', 51);
    const none = await callOracle('test_both_option', [toHex(new Fr(0)), toHex(new Fr(0))], 51);
    expect(none.values).toEqual([toHex(new Fr(0)), toHex(new Fr(0))]); // Option::none()
  });

  it('tracks uncalled fixtures', async () => {
    expect(resolver.getUncalledFixtures()).toContain('test_single');

    await callOracle('test_single', [toHex(new Fr(10)), toHex(AztecAddress.fromNumberUnsafe(1))]);

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

  // Encodes `name` as Noir's `BoundedVec<u8, 64>` wire shape, via the same entry the resolver decodes it with.
  function setScenario(name: string, sessionId: number) {
    const bytes = BoundedVec.from({ data: Array.from(name, c => c.charCodeAt(0)), maxLength: 64 });
    const [data, length] = SET_SCENARIO_ENTRY.params[0].type.serialization!.fn(bytes) as [Fr[], Fr];
    return callOracle('aztec_oracle_test_set_scenario', [data.map(toHex), toHex(length)], sessionId);
  }

  function toHex(v: Fr | AztecAddress): string {
    return withoutHexPrefix(v.toString());
  }
});
