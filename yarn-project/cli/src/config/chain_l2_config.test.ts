import { getConsensusConfigFromNetworkEnv, validateNetworkConsensusConfig } from '@aztec/stdlib/config';
import {
  DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
  DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
  DEFAULT_MIN_BLOCK_DURATION,
  DEFAULT_P2P_PROPAGATION_TIME,
  ProposerTimetable,
} from '@aztec/stdlib/timetable';

import { enrichEnvironmentWithChainName } from './chain_l2_config.js';
import { devnetConfig, mainnetConfig, testnetConfig } from './generated/networks.js';

const generatedConfigs = {
  devnet: devnetConfig,
  testnet: testnetConfig,
  mainnet: mainnetConfig,
} as const;

describe('generated network configs', () => {
  for (const [name, config] of Object.entries(generatedConfigs)) {
    describe(name, () => {
      it('passes consensus config validation', () => {
        expect(validateNetworkConsensusConfig(getConsensusConfigFromNetworkEnv(config))).toEqual([]);
      });

      it('declares MAX_BLOCKS_PER_CHECKPOINT equal to what the default proposer budgets derive', () => {
        const consensus = getConsensusConfigFromNetworkEnv(config);
        const computed = new ProposerTimetable({
          l1Constants: {
            l1GenesisTime: 0n,
            slotDuration: consensus.aztecSlotDuration,
            ethereumSlotDuration: consensus.ethereumSlotDuration,
          },
          blockDuration: consensus.blockDurationMs / 1000,
          minBlockDuration: DEFAULT_MIN_BLOCK_DURATION,
          p2pPropagationTime: DEFAULT_P2P_PROPAGATION_TIME,
          checkpointProposalPrepareTime: DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
          checkpointProposalInitTime: DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
          checkpointProposalSyncGrace: consensus.checkpointProposalSyncGraceSeconds,
        }).getMaxBlocksPerCheckpoint();
        expect(computed).toBe(config.MAX_BLOCKS_PER_CHECKPOINT);
      });
    });
  }
});

describe('enrichEnvironmentWithChainName', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SEQ_BLOCK_DURATION_MS;
    delete process.env.ALLOW_OVERRIDING_NETWORK_CONFIG;
    delete process.env.DATA_DIRECTORY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when a consensus-critical env var conflicts with the network config', () => {
    process.env.SEQ_BLOCK_DURATION_MS = '3000';
    expect(() => enrichEnvironmentWithChainName('testnet')).toThrow(/SEQ_BLOCK_DURATION_MS/);
  });

  it('keeps the operator value and continues when ALLOW_OVERRIDING_NETWORK_CONFIG is set', () => {
    process.env.SEQ_BLOCK_DURATION_MS = '3000';
    process.env.ALLOW_OVERRIDING_NETWORK_CONFIG = '1';
    expect(() => enrichEnvironmentWithChainName('testnet')).not.toThrow();
    expect(process.env.SEQ_BLOCK_DURATION_MS).toBe('3000');
  });
});
