import { assertNoDefaultFields } from './assert_no_default_fields.js';
import {
  SERIALIZABLE_CONTRACT_INSTANCE_FIXTURE_TYPE_NAME,
  buildSerializableContractInstanceFixtures,
} from './serializable_contract_instance_fixture.js';

describe('SerializableContractInstance fixture', () => {
  it('produces deterministic bytes across runs', () => {
    const a = buildSerializableContractInstanceFixtures();
    const b = buildSerializableContractInstanceFixtures();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].toBuffer().equals(b[i].toBuffer())).toBe(true);
    }
  });

  it('produces fixtures with stable count', () => {
    expect(buildSerializableContractInstanceFixtures().length).toBe(1);
  });

  it('variant 0 has no default fields', () => {
    expect(() =>
      assertNoDefaultFields(
        SERIALIZABLE_CONTRACT_INSTANCE_FIXTURE_TYPE_NAME,
        buildSerializableContractInstanceFixtures()[0],
      ),
    ).not.toThrow();
  });
});
