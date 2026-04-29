import { assertNoDefaultFields } from './assert_no_default_fields.js';
import {
  STORED_PRIVATE_EVENT_FIXTURE_TYPE_NAME,
  buildStoredPrivateEventFixtures,
} from './stored_private_event_fixture.js';

describe('StoredPrivateEvent fixture', () => {
  it('produces deterministic bytes across runs', () => {
    const a = buildStoredPrivateEventFixtures();
    const b = buildStoredPrivateEventFixtures();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].toBuffer().equals(b[i].toBuffer())).toBe(true);
    }
  });

  it('produces fixtures with stable count', () => {
    expect(buildStoredPrivateEventFixtures().length).toBe(1);
  });

  it('variant 0 has no default fields', () => {
    expect(() =>
      assertNoDefaultFields(STORED_PRIVATE_EVENT_FIXTURE_TYPE_NAME, buildStoredPrivateEventFixtures()[0]),
    ).not.toThrow();
  });
});
