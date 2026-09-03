import { describe, expect, it } from '@jest/globals';

import { DEFAULT_TEST_MNEMONIC, assertSafeL1Signer } from './default_mnemonic_guard.js';

describe('assertSafeL1Signer', () => {
  const implicitDefault = {
    mnemonic: DEFAULT_TEST_MNEMONIC,
    mnemonicWasExplicit: false,
    privateKey: undefined,
    allowDefaultMnemonic: false,
  };

  it.each([31337, 1337])('allows the implicit test mnemonic on local chain %i', chainId => {
    expect(() => assertSafeL1Signer({ ...implicitDefault, chainId })).not.toThrow();
  });

  it.each([1, 11155111, 42])('rejects the implicit test mnemonic on non-local chain %i', chainId => {
    expect(() => assertSafeL1Signer({ ...implicitDefault, chainId })).toThrow(
      `--l1-chain-id ${chainId} is not a local network`,
    );
  });

  it('allows an explicit private key on a non-local chain', () => {
    expect(() => assertSafeL1Signer({ ...implicitDefault, chainId: 1, privateKey: '0x1234' })).not.toThrow();
  });

  it('allows a custom mnemonic on a non-local chain', () => {
    expect(() => assertSafeL1Signer({ ...implicitDefault, chainId: 1, mnemonic: 'custom mnemonic' })).not.toThrow();
  });

  it('allows an explicitly supplied test mnemonic on a non-local chain', () => {
    expect(() => assertSafeL1Signer({ ...implicitDefault, chainId: 1, mnemonicWasExplicit: true })).not.toThrow();
  });

  it('allows an explicit unsafe opt-in on a non-local chain', () => {
    expect(() => assertSafeL1Signer({ ...implicitDefault, chainId: 1, allowDefaultMnemonic: true })).not.toThrow();
  });
});
