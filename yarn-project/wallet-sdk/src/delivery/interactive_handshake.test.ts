import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import {
  INTERACTIVE_HANDSHAKE_REQUEST_KIND,
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
  STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
} from '@aztec/standard-contracts/handshake-registry/constants';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { deriveKeys, derivePublicKeyFromSecretKey } from '@aztec/stdlib/keys';

import { jest } from '@jest/globals';

import {
  type InteractiveHandshakeBackupEntry,
  type InteractiveHandshakeTransport,
  createInteractiveHandshakeResolver,
  createInteractiveHandshakeResponder,
} from './interactive_handshake.js';
import { type InteractiveHandshakeCustomRequest, type RecipientSignature, recipientSignatureToFields } from './wire.js';

describe('interactive handshake delivery helpers', () => {
  let recipientCompleteAddress: CompleteAddress;
  let otherCompleteAddress: CompleteAddress;
  let masterMessageSigningSecretKey: GrumpkinScalar;
  let calls: string[];
  let backupEntries: InteractiveHandshakeBackupEntry[];
  let registerTaggingSecretSource: jest.Mock<
    (source: { kind: 'handshake'; recipient: AztecAddress; ephPk: Fr }) => Promise<void>
  >;
  let getSigningKey: jest.Mock<(recipient: AztecAddress) => Promise<GrumpkinScalar>>;

  beforeEach(async () => {
    const secretKey = Fr.random();
    ({ masterMessageSigningSecretKey } = await deriveKeys(secretKey));
    recipientCompleteAddress = await CompleteAddress.random();
    otherCompleteAddress = await CompleteAddress.random();

    calls = [];
    backupEntries = [];
    registerTaggingSecretSource = jest
      .fn<(source: { kind: 'handshake'; recipient: AztecAddress; ephPk: Fr }) => Promise<void>>()
      .mockImplementation(() => {
        calls.push('register');
        return Promise.resolve();
      });
    getSigningKey = jest.fn<(recipient: AztecAddress) => Promise<GrumpkinScalar>>().mockImplementation(() => {
      calls.push('sign');
      return Promise.resolve(masterMessageSigningSecretKey);
    });
  });

  function makeResponder() {
    return createInteractiveHandshakeResponder({
      pxe: {
        registerTaggingSecretSource,
        getRegisteredAccounts: () => Promise.resolve([otherCompleteAddress, recipientCompleteAddress]),
      },
      getSigningKey,
      backup: {
        store: entry => {
          calls.push('backup');
          backupEntries.push(entry);
          return Promise.resolve();
        },
      },
    });
  }

  function makeRequest(overrides: Partial<InteractiveHandshakeCustomRequest> = {}): InteractiveHandshakeCustomRequest {
    return {
      contractAddress: STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
      contractClassId: STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
      kind: INTERACTIVE_HANDSHAKE_REQUEST_KIND,
      payload: [recipientCompleteAddress.address.toField(), new Fr(1), new Fr(1), Fr.random()],
      ...overrides,
    };
  }

  describe('createInteractiveHandshakeResponder', () => {
    it('registers with PXE, persists the backup, then signs, in that order', async () => {
      const request = makeRequest();
      const recipientSignature = await makeResponder()(request);

      expect(calls).toEqual(['register', 'backup', 'sign']);
      expect(registerTaggingSecretSource).toHaveBeenCalledWith({
        kind: 'handshake',
        recipient: recipientCompleteAddress.address,
        ephPk: request.payload[3],
      });
      expect(backupEntries).toEqual([{ recipient: recipientCompleteAddress.address, ephPkX: request.payload[3] }]);
      expect(recipientSignature.publicKeys).toEqual(recipientCompleteAddress.publicKeys);
      expect(recipientSignature.partialAddress).toEqual(recipientCompleteAddress.partialAddress);
    });

    it('resolves the key and address of the account the request targets', async () => {
      await makeResponder()(makeRequest());
      expect(getSigningKey.mock.calls).toEqual([[recipientCompleteAddress.address]]);
    });

    it('produces a signature that verifies under the recipient master message-signing key', async () => {
      const request = makeRequest();
      const recipientSignature = await makeResponder()(request);

      // The registry recomputes this exact domain-separated message in-circuit.
      const message = await poseidon2HashWithSeparator(
        [request.payload[1], request.payload[2], STANDARD_HANDSHAKE_REGISTRY_ADDRESS, request.payload[3]],
        DomainSeparator.INTERACTIVE_HANDSHAKE_SIGNATURE,
      );
      const mspk = await derivePublicKeyFromSecretKey(masterMessageSigningSecretKey);
      expect(await new Schnorr().verifySignature(message, mspk, recipientSignature.signature)).toBe(true);
    });

    it('produces no backup entry and no signature when PXE rejects the registration', async () => {
      registerTaggingSecretSource.mockRejectedValue(new Error('not a curve point'));
      await expect(makeResponder()(makeRequest())).rejects.toThrow('not a curve point');
      expect(backupEntries).toEqual([]);
      expect(getSigningKey).not.toHaveBeenCalled();
    });

    it('produces no signature when the backup write fails', async () => {
      const responder = createInteractiveHandshakeResponder({
        pxe: {
          registerTaggingSecretSource,
          getRegisteredAccounts: () => Promise.resolve([recipientCompleteAddress]),
        },
        getSigningKey,
        backup: { store: () => Promise.reject(new Error('backup store unavailable')) },
      });
      await expect(responder(makeRequest())).rejects.toThrow('backup store unavailable');
      expect(getSigningKey).not.toHaveBeenCalled();
    });

    it('rejects a request for an account the wallet does not hold, with no side effects', async () => {
      const responder = createInteractiveHandshakeResponder({
        pxe: {
          registerTaggingSecretSource,
          getRegisteredAccounts: () => Promise.resolve([otherCompleteAddress]),
        },
        getSigningKey,
        backup: {
          store: entry => {
            backupEntries.push(entry);
            return Promise.resolve();
          },
        },
      });
      await expect(responder(makeRequest())).rejects.toThrow('account not held by this wallet');
      expect(registerTaggingSecretSource).not.toHaveBeenCalled();
      expect(backupEntries).toEqual([]);
    });

    it.each<[string, Partial<InteractiveHandshakeCustomRequest>]>([
      ['wrong kind', { kind: Fr.random() }],
      ['wrong registry address', { contractAddress: new AztecAddress(Fr.random()) }],
      ['wrong contract class', { contractClassId: Fr.random() }],
      ['bad payload shape', { payload: [Fr.random()] }],
    ])('rejects a request with %s, with no side effects', async (_, overrides) => {
      await expect(makeResponder()(makeRequest(overrides))).rejects.toThrow();
      expect(registerTaggingSecretSource).not.toHaveBeenCalled();
      expect(backupEntries).toEqual([]);
      expect(getSigningKey).not.toHaveBeenCalled();
    });
  });

  describe('createInteractiveHandshakeResolver', () => {
    it('round-trips through the responder and returns the signature as fields', async () => {
      const responder = makeResponder();
      let produced: RecipientSignature | undefined;
      const resolver = createInteractiveHandshakeResolver(async request => {
        produced = await responder(request);
        return produced;
      });

      const fields = await resolver(makeRequest());
      expect(fields).toEqual(recipientSignatureToFields(produced!));
    });

    it('rejects an invalid request without invoking the transport', async () => {
      const transport = jest.fn<InteractiveHandshakeTransport>();
      const resolver = createInteractiveHandshakeResolver(transport);
      await expect(resolver(makeRequest({ kind: Fr.random() }))).rejects.toThrow('unexpected kind');
      expect(transport).not.toHaveBeenCalled();
    });
  });
});
