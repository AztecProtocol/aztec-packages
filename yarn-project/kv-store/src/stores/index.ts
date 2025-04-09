import type { L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from '@aztec/stdlib/block';

export * from './l2_tips_store.js';
export * from './l2_tips_memory_store.js';

export type L2TipsStore = L2BlockStreamEventHandler & L2BlockStreamLocalDataProvider;
