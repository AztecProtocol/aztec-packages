import { L2TipsMemoryStore } from '@aztec/stdlib/block';

import { testL2TipsStore } from './l2_tips_store_suite.test.js';

// This test is here since the test suite is written using chai and not jest,
// so we can run the tests with mocha. Ideally we would have the test suite
// live in stdlib, written with jest matchers, and have mocha use the jest
// matchers when running that suite. But I didn't manage to get it to work.
// So the test for this stdlib class lives here.
describe('L2TipsMemoryStore', () => {
  testL2TipsStore(() => Promise.resolve(new L2TipsMemoryStore()));
});
