/* eslint-disable camelcase */
import {
  BOUNDED_VEC,
<<<<<<< HEAD
  BYTE,
=======
>>>>>>> origin/v5-next
  type BoundedVec,
  FIELD,
  OPTION,
  type Option,
  type OracleRegistryEntry,
<<<<<<< HEAD
=======
  U8,
>>>>>>> origin/v5-next
  makeEntry,
} from '@aztec/pxe/simulator';

import { synthesizeDefaultFixtures } from './default_fixtures.js';

describe('synthesizeDefaultFixtures', () => {
  it('synthesizes a BoundedVec<Byte> param, padding data below capacity', () => {
    const registry: Record<string, OracleRegistryEntry> = {
      push_bytes: makeEntry({
<<<<<<< HEAD
        params: [{ name: 'ciphertext', type: BOUNDED_VEC(BYTE) }],
=======
        params: [{ name: 'ciphertext', type: BOUNDED_VEC(U8) }],
>>>>>>> origin/v5-next
      }),
    };

    const scenarios = synthesizeDefaultFixtures(registry)['push_bytes'];
    expect(scenarios).toHaveLength(1);

    const ciphertext = scenarios[0].inputs.ciphertext as BoundedVec<number>;
    expect(ciphertext.data).toEqual([10, 11, 12]);
    expect(ciphertext.maxLength).toBe(5);
  });

  it('synthesizes an Option<BoundedVec<Byte>> return as two cases named some/none', () => {
    const registry: Record<string, OracleRegistryEntry> = {
      decrypt_bytes: makeEntry({
<<<<<<< HEAD
        returnType: OPTION(BOUNDED_VEC(BYTE)),
=======
        returnType: OPTION(BOUNDED_VEC(U8)),
>>>>>>> origin/v5-next
      }),
    };

    const scenarios = synthesizeDefaultFixtures(registry)['decrypt_bytes'];
    expect(scenarios).toHaveLength(2);
    expect(scenarios.map(s => s.scenario)).toEqual(['some', 'none']);

    const some = scenarios[0].output as Option<BoundedVec<number>>;
    expect(some.isSome()).toBe(true);
    if (some.isSome()) {
      expect(some.value.data).toEqual([10, 11, 12]);
    }

    const none = scenarios[1].output as Option<BoundedVec<number>>;
    expect(none.isSome()).toBe(false);
  });

  it('zips a both-Option oracle into some+some and none+none (not the cross product)', () => {
    const registry: Record<string, OracleRegistryEntry> = {
      both_option: makeEntry({
        params: [{ name: 'p', type: OPTION(FIELD) }],
        returnType: OPTION(FIELD),
      }),
    };

    const scenarios = synthesizeDefaultFixtures(registry)['both_option'];
    // Both positions have two scenarios; they advance together (a zip), so there are two cases, not four.
    expect(scenarios).toHaveLength(2);
    expect(scenarios.map(s => s.scenario)).toEqual(['some+some', 'none+none']);

    expect((scenarios[0].inputs.p as Option<unknown>).isSome()).toBe(true);
    expect((scenarios[0].output as Option<unknown>).isSome()).toBe(true);
    expect((scenarios[1].inputs.p as Option<unknown>).isSome()).toBe(false);
    expect((scenarios[1].output as Option<unknown>).isSome()).toBe(false);
  });
});
