import type { L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from '@aztec/stdlib/block';

export type L2TipsStore = L2BlockStreamEventHandler & L2BlockStreamLocalDataProvider;
