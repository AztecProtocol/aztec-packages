import { P2PClientType } from './client_type.js';
import { getTopicsForClientAndConfig } from './topic_type.js';

describe('Gossip topic retrieval', () => {
  it.each([
    [P2PClientType.Full, ['tx', 'block_proposal', 'block_attestation'], true],
    [P2PClientType.Prover, ['tx', 'block_proposal'], true],
    [P2PClientType.Full, ['block_proposal', 'block_attestation'], false],
    [P2PClientType.Prover, ['block_proposal'], false],
  ])(
    'Node type %s subscribes to topics %s with transactions enabled: %s',
    (clientType: P2PClientType, expectedTopics: string[], transactionsEnabled: boolean) => {
      expect(getTopicsForClientAndConfig(clientType, !transactionsEnabled)).toEqual(expectedTopics);
    },
  );
});
