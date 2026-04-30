import { assertNoDefaultFields } from './assert_no_default_fields.js';
import {
  SERIALIZABLE_CONTRACT_CLASS_DATA_FIXTURE_TYPE_NAME,
  buildSerializableContractClassDataFixtures,
} from './serializable_contract_class_data_fixture.js';

describe('SerializableContractClassData fixture', () => {
  it('produces deterministic bytes across runs', () => {
    const a = buildSerializableContractClassDataFixtures();
    const b = buildSerializableContractClassDataFixtures();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].toBuffer().equals(b[i].toBuffer())).toBe(true);
    }
  });

  it('produces fixtures with stable count', () => {
    expect(buildSerializableContractClassDataFixtures().length).toBe(2);
  });

  it('variant 0 has no default fields', () => {
    expect(() =>
      assertNoDefaultFields(
        SERIALIZABLE_CONTRACT_CLASS_DATA_FIXTURE_TYPE_NAME,
        buildSerializableContractClassDataFixtures()[0],
      ),
    ).not.toThrow();
  });
});
