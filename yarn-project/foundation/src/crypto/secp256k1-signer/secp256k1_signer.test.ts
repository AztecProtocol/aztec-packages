import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import { hashMessage, recoverAddress as viemRecoverAddress, recoverPublicKey as viemRecoverPublicKey } from 'viem';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount, publicKeyToAddress } from 'viem/accounts';

import { Secp256k1Signer } from './secp256k1_signer.js';
import {
  recoverAddress as lightRecoverAddress,
  recoverPublicKey as lightRecoverPublicKey,
  makeEthSignDigest,
} from './utils.js';

/**
 * Differential fuzzing implementation of viem's signer and the secp256k1 signer
 */
describe('Secp256k1Signer', () => {
  let viemSigner: PrivateKeyAccount;
  let lightSigner: Secp256k1Signer;

  beforeEach(() => {
    const privateKey = generatePrivateKey();
    viemSigner = privateKeyToAccount(privateKey);

    lightSigner = new Secp256k1Signer(Buffer32.fromBuffer(Buffer.from(privateKey.slice(2), 'hex')));
  });

  it('Compare implementation against viem', async () => {
    const message = Buffer.from('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
    // Use to compare addresses at the end
    const accountAddress = viemSigner.address;

    // We use eth hashed message as viem will automatically do this with signMessage
    const ethHashedMessage = hashMessage({ raw: message });
    const ethHashedMessageBuffer = Buffer32.fromBuffer(Buffer.from(ethHashedMessage.slice(2), 'hex'));

    const viemSignature = Signature.fromString(await viemSigner.signMessage({ message: { raw: message } }));
    const lightSignature = lightSigner.sign(ethHashedMessageBuffer);

    // Check signatures match
    expect(viemSignature.equals(lightSignature)).toBe(true);

    const viemPublicKey = await viemRecoverPublicKey({ hash: ethHashedMessage, signature: viemSignature.toString() });
    const lightPublicKey = lightRecoverPublicKey(ethHashedMessageBuffer, lightSignature);

    // Check recovered public keys match
    expect(Buffer.from(viemPublicKey.slice(2), 'hex')).toEqual(lightPublicKey);

    // Get the eth address can be recovered from the message and signature
    const viemPublicKeyToAddress = publicKeyToAddress(viemPublicKey);
    const viemAddress = EthAddress.fromString(
      await viemRecoverAddress({ hash: ethHashedMessage, signature: viemSignature.toString() }),
    );
    const lightAddress = lightRecoverAddress(
      Buffer32.fromBuffer(Buffer.from(ethHashedMessage.slice(2), 'hex')),
      lightSignature,
    );

    // Check viem signer matches
    expect(viemAddress.toString()).toEqual(accountAddress.toString().toLowerCase());
    expect(accountAddress.toString()).toEqual(viemPublicKeyToAddress.toString());

    // Check light signer matches
    expect(viemAddress.toString()).toEqual(lightAddress.toString());
  });

  describe('signWithCustomK', () => {
    it('should create valid signatures with custom k at specific index', () => {
      const signer = Secp256k1Signer.random();
      const message = Buffer32.random();

      const signature = signer.signWithCustomK(message, 0);
      const recovered = lightRecoverAddress(message, signature);

      expect(recovered.equals(signer.address)).toBe(true);
    });

    it('should create different signatures with different k indices', () => {
      const signer = Secp256k1Signer.random();
      const message = Buffer32.random();

      const sig1 = signer.signWithCustomK(message, 0);
      const sig2 = signer.signWithCustomK(message, 1);
      const sig3 = signer.signWithCustomK(message, 2);

      // All signatures should be different
      expect(sig1.equals(sig2)).toBe(false);
      expect(sig2.equals(sig3)).toBe(false);
      expect(sig1.equals(sig3)).toBe(false);
    });

    it('should create same signature for same k index', () => {
      const signer = Secp256k1Signer.random();
      const message = Buffer32.random();

      const sig1 = signer.signWithCustomK(message, 5);
      const sig2 = signer.signWithCustomK(message, 5);

      // Same k index should produce same signature
      expect(sig1.equals(sig2)).toBe(true);
    });

    it('should differ from deterministic signing', () => {
      const signer = Secp256k1Signer.random();
      const message = Buffer32.random();

      const deterministicSig = signer.sign(message);
      const customKSig = signer.signWithCustomK(message, 0);

      // Should be different signatures
      expect(deterministicSig.equals(customKSig)).toBe(false);

      // But both should recover to same address
      expect(lightRecoverAddress(message, deterministicSig).equals(signer.address)).toBe(true);
      expect(lightRecoverAddress(message, customKSig).equals(signer.address)).toBe(true);
    });
  });

  describe('signMessageWithCustomK', () => {
    it('should apply eth_sign prefix and use custom k at specific index', () => {
      const signer = Secp256k1Signer.random();
      const message = Buffer32.random();

      const signature = signer.signMessageWithCustomK(message, 0);

      // Should recover with eth_sign digest
      const digest = makeEthSignDigest(message);
      const recovered = lightRecoverAddress(digest, signature);

      expect(recovered.equals(signer.address)).toBe(true);
    });
  });
});
