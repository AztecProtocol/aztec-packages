import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import { hashMessage, recoverAddress as viemRecoverAddress, recoverPublicKey as viemRecoverPublicKey } from 'viem';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount, publicKeyToAddress } from 'viem/accounts';

import { Secp256k1Signer } from './secp256k1_signer.js';
import { recoverAddress as lightRecoverAddress, recoverPublicKey as lightRecoverPublicKey } from './utils.js';

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
});
