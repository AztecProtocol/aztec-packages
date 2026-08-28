import { getConfigFromMappings } from '@aztec/foundation/config';
import type { SequencerConfig } from '@aztec/stdlib/config';

import { sequencerConfigMappings } from './config.js';

describe('sequencer config', () => {
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = process.env;
    process.env = {};
  });

  afterEach(() => {
    process.env = env;
  });

  const getConfig = () => getConfigFromMappings<SequencerConfig>(sequencerConfigMappings);

  describe('SEQ_INBOX_L1_CONFIRMATIONS', () => {
    it('consumes Inbox buckets immediately by default', () => {
      expect(getConfig().inboxL1Confirmations).toBe(0);
    });

    it('accepts waiting for one L1 confirmation', () => {
      process.env.SEQ_INBOX_L1_CONFIRMATIONS = '1';

      expect(getConfig().inboxL1Confirmations).toBe(1);
    });

    it('rejects a deeper confirmation count, naming the supported values', () => {
      process.env.SEQ_INBOX_L1_CONFIRMATIONS = '2';

      expect(getConfig).toThrow(/supported values are 0 and 1/);
    });

    it('rejects a non-numeric confirmation count instead of falling back to the default', () => {
      process.env.SEQ_INBOX_L1_CONFIRMATIONS = 'abc';

      expect(getConfig).toThrow(/supported values are 0 and 1/);
    });
  });
});
