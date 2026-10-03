import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { Fr } from '@aztec/foundation/curves/bn254';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { deriveKeys, derivePublicKeyFromSecretKey } from '@aztec/stdlib/keys';

import { signInteractiveHandshake } from './signing.js';
import type { InteractiveHandshakeRequest } from './wire.js';

describe('signInteractiveHandshake', () => {
  it('produces a valid signature bound to the recipient and the standard registry', async () => {
    const secretKey = Fr.random();
    const { masterMessageSigningSecretKey } = await deriveKeys(secretKey);
    const completeAddress = await CompleteAddress.random();
    const request: InteractiveHandshakeRequest = {
      recipient: completeAddress.address,
      chainId: new Fr(1),
      version: new Fr(1),
      ephPkX: Fr.random(),
    };

    const recipientSignature = await signInteractiveHandshake(request, completeAddress, masterMessageSigningSecretKey);

    expect(recipientSignature.publicKeys).toEqual(completeAddress.publicKeys);
    expect(recipientSignature.partialAddress).toEqual(completeAddress.partialAddress);

    const mspk = await derivePublicKeyFromSecretKey(masterMessageSigningSecretKey);
    const [mspkX, mspkYIsPositive] = mspk.toXAndSign();
    expect(recipientSignature.mspkX).toEqual(mspkX);
    expect(recipientSignature.mspkYIsPositive).toEqual(mspkYIsPositive);

    // The registry recomputes this exact domain-separated message in-circuit.
    const message = await poseidon2HashWithSeparator(
      [request.chainId, request.version, STANDARD_HANDSHAKE_REGISTRY_ADDRESS, request.ephPkX],
      DomainSeparator.INTERACTIVE_HANDSHAKE_SIGNATURE,
    );
    expect(await new Schnorr().verifySignature(message, mspk, recipientSignature.signature)).toBe(true);
  });
});
