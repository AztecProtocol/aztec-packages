// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Fr } from '@aztec/aztec.js/fields';
import { WalletManager } from '@aztec/wallet-sdk/manager';

describe('WalletManager', () => {
  describe('configure', () => {
    it('creates a WalletManager instance with extension config', () => {
      const manager = WalletManager.configure({
        extensions: { enabled: true },
      });
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(WalletManager);
    });

    it('creates a WalletManager with allow list', () => {
      const manager = WalletManager.configure({
        extensions: {
          enabled: true,
          allowList: ['extension-id-1', 'extension-id-2'],
        },
      });
      expect(manager).toBeDefined();
    });

    it('creates a WalletManager with block list', () => {
      const manager = WalletManager.configure({
        extensions: {
          enabled: true,
          blockList: ['malicious-extension'],
        },
      });
      expect(manager).toBeDefined();
    });

    it('creates a WalletManager with extensions disabled', () => {
      const manager = WalletManager.configure({
        extensions: { enabled: false },
      });
      expect(manager).toBeDefined();
    });
  });

  describe('getAvailableWallets', () => {
    it('returns a DiscoverySession with expected shape', () => {
      const manager = WalletManager.configure({
        extensions: { enabled: true },
      });

      const session = manager.getAvailableWallets({
        chainInfo: {
          chainId: new Fr(31337),
          version: new Fr(1),
        },
        appId: 'test-app',
        timeout: 100,
      });

      // Verify the discovery session has the expected API shape
      expect(session).toBeDefined();
      expect(typeof session.cancel).toBe('function');
      expect(session.wallets).toBeDefined();
      expect(session.done).toBeInstanceOf(Promise);

      // Clean up
      session.cancel();
    });

    it('invokes onWalletDiscovered callback when provided', () => {
      const manager = WalletManager.configure({
        extensions: { enabled: true },
      });

      const discovered: unknown[] = [];
      const session = manager.getAvailableWallets({
        chainInfo: {
          chainId: new Fr(31337),
          version: new Fr(1),
        },
        appId: 'test-app',
        timeout: 100,
        onWalletDiscovered: (provider) => {
          discovered.push(provider);
        },
      });

      // No wallets will be discovered in unit test (no extensions running),
      // but the callback should be accepted without error
      expect(discovered).toHaveLength(0);
      session.cancel();
    });

    it('cancel stops discovery without error', () => {
      const manager = WalletManager.configure({
        extensions: { enabled: true },
      });

      const session = manager.getAvailableWallets({
        chainInfo: {
          chainId: new Fr(31337),
          version: new Fr(1),
        },
        appId: 'test-app',
        timeout: 5000,
      });

      // Should not throw
      expect(() => session.cancel()).not.toThrow();
    });
  });
});
