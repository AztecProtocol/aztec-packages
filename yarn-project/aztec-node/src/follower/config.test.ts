import { assertValidFollowerConfig, isFollowerModeEnabled } from './config.js';

/** Config of a well-formed follower node, which every test below perturbs one field at a time. */
const validFollowerConfig = {
  followerUpstreamUrl: 'http://upstream:8080',
  disableValidator: true,
  p2pEnabled: false,
  enableProverNode: false,
  enableOffenseCollection: false,
  fishermanMode: false,
  useAutomineSequencer: false,
};

describe('follower config', () => {
  describe('isFollowerModeEnabled', () => {
    it('is enabled by an upstream url', () => {
      expect(isFollowerModeEnabled({ followerUpstreamUrl: 'http://upstream:8080' })).toBe(true);
    });

    it('is disabled without an upstream url', () => {
      expect(isFollowerModeEnabled({})).toBe(false);
      expect(isFollowerModeEnabled({ followerUpstreamUrl: '' })).toBe(false);
    });
  });

  describe('assertValidFollowerConfig', () => {
    it('accepts a well-formed follower config', () => {
      expect(() => assertValidFollowerConfig(validFollowerConfig)).not.toThrow();
    });

    it('rejects a malformed upstream url', () => {
      expect(() => assertValidFollowerConfig({ ...validFollowerConfig, followerUpstreamUrl: 'upstream:8080' })).toThrow(
        /Invalid upstream node URL/,
      );
    });

    it.each([
      ['validator', { disableValidator: false }, /VALIDATOR_DISABLED/],
      ['p2p', { p2pEnabled: true }, /P2P_ENABLED/],
      ['prover node', { enableProverNode: true }, /ENABLE_PROVER_NODE/],
      ['offense collection', { enableOffenseCollection: true }, /OFFENSE_COLLECTION_ENABLED/],
      ['fisherman mode', { fishermanMode: true }, /FISHERMAN_MODE/],
      ['automine sequencer', { useAutomineSequencer: true }, /USE_AUTOMINE_SEQUENCER/],
    ])('rejects an enabled %s', (_name, override, expected) => {
      expect(() => assertValidFollowerConfig({ ...validFollowerConfig, ...override })).toThrow(expected);
    });

    it('reports every incompatible subsystem at once', () => {
      expect(() =>
        assertValidFollowerConfig({ ...validFollowerConfig, disableValidator: false, p2pEnabled: true }),
      ).toThrow(/VALIDATOR_DISABLED.*P2P_ENABLED/s);
    });
  });
});
