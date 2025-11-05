import { P2PClientType } from './client_type.js';
import { TopicType, getTopicFromString, getTopicsForClientAndConfig } from './topic_type.js';

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

describe('getTopicFromString', () => {
  describe('valid topic strings', () => {
    it('should parse tx topic with version 0.1.0', () => {
      const result = getTopicFromString('/aztec/tx/0.1.0');
      expect(result).toBe(TopicType.tx);
    });

    it('should parse block_proposal topic with version 0.1.0', () => {
      const result = getTopicFromString('/aztec/block_proposal/0.1.0');
      expect(result).toBe(TopicType.block_proposal);
    });

    it('should parse block_attestation topic with version 0.1.0', () => {
      const result = getTopicFromString('/aztec/block_attestation/0.1.0');
      expect(result).toBe(TopicType.block_attestation);
    });

    it('should parse topic with different protocol version', () => {
      const result = getTopicFromString('/aztec/tx/1.2.3');
      expect(result).toBe(TopicType.tx);
    });

    it('should parse topic with complex version string', () => {
      const result = getTopicFromString('/aztec/block_proposal/v2.0.0-alpha.1');
      expect(result).toBe(TopicType.block_proposal);
    });

    it('should parse topic with extra path segments', () => {
      // Even if there are extra segments, should still extract the topic
      const result = getTopicFromString('/aztec/tx/0.1.0/extra');
      expect(result).toBe(TopicType.tx);
    });
  });

  describe('invalid topic strings', () => {
    it('should return undefined for empty string', () => {
      const result = getTopicFromString('');
      expect(result).toBeUndefined();
    });

    it('should return undefined for string without leading slash', () => {
      const result = getTopicFromString('aztec/tx/0.1.0');
      expect(result).toBeUndefined();
    });

    it('should return undefined for wrong protocol name', () => {
      const result = getTopicFromString('/ethereum/tx/0.1.0');
      expect(result).toBeUndefined();
    });

    it('should return undefined for unknown topic type', () => {
      const result = getTopicFromString('/aztec/unknown_topic/0.1.0');
      expect(result).toBeUndefined();
    });

    it('should return undefined for malformed topic (no version)', () => {
      const result = getTopicFromString('/aztec/tx');
      expect(result).toBeUndefined();
    });

    it('should return undefined for malformed topic (only protocol)', () => {
      const result = getTopicFromString('/aztec');
      expect(result).toBeUndefined();
    });

    it('should return undefined for malformed topic (missing parts)', () => {
      const result = getTopicFromString('/aztec//0.1.0');
      expect(result).toBeUndefined();
    });

    it('should return undefined for topic with case mismatch', () => {
      const result = getTopicFromString('/aztec/TX/0.1.0');
      expect(result).toBeUndefined();
    });

    it('should return undefined for topic with protocol case mismatch', () => {
      const result = getTopicFromString('/Aztec/tx/0.1.0');
      expect(result).toBeUndefined();
    });

    it('should return undefined for random string', () => {
      const result = getTopicFromString('random-string');
      expect(result).toBeUndefined();
    });

    it('should return undefined for single slash', () => {
      const result = getTopicFromString('/');
      expect(result).toBeUndefined();
    });

    it('should return undefined for topic with spaces', () => {
      const result = getTopicFromString('/aztec/tx /0.1.0');
      expect(result).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle topic string with trailing slash', () => {
      const result = getTopicFromString('/aztec/tx/0.1.0/');
      expect(result).toBe(TopicType.tx);
    });

    it('should handle topic string with multiple trailing slashes', () => {
      const result = getTopicFromString('/aztec/tx/0.1.0//');
      expect(result).toBe(TopicType.tx);
    });

    it('should handle all valid topic types', () => {
      const topicStrings = [
        ['/aztec/tx/0.1.0', TopicType.tx],
        ['/aztec/block_proposal/0.1.0', TopicType.block_proposal],
        ['/aztec/block_attestation/0.1.0', TopicType.block_attestation],
      ] as const;

      topicStrings.forEach(([topicStr, expectedType]) => {
        expect(getTopicFromString(topicStr)).toBe(expectedType);
      });
    });
  });
});
