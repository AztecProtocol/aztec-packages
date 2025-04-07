import { L2TipsMemoryStore } from './l2_tips_memory_store.js';
import { testL2TipsStore } from './l2_tips_store_suite.test.js';

describe('L2TipsMemoryStore', () => {
  testL2TipsStore(() => Promise.resolve(new L2TipsMemoryStore()));
});
