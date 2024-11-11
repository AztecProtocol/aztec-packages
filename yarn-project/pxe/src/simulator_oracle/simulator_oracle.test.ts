import {
  type AztecNode,
  EncryptedL2NoteLog,
  EncryptedLogPayload,
  L1NotePayload,
  Note,
  type TxEffect,
  TxHash,
  TxScopedEncryptedL2NoteLog,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  type Fq,
  Fr,
  GrumpkinScalar,
  INITIAL_L2_BLOCK_NUM,
  KeyValidationRequest,
  MAX_NOTE_HASHES_PER_TX,
  TaggingSecret,
  computeAddress,
  computeOvskApp,
  computeTaggingSecret,
  deriveKeys,
} from '@aztec/circuits.js';
import { pedersenHash, poseidon2Hash } from '@aztec/foundation/crypto';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type AcirSimulator } from '@aztec/simulator';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

import { type IncomingNoteDao } from '../database/incoming_note_dao.js';
import { type PxeDatabase } from '../database/index.js';
import { KVPxeDatabase } from '../database/kv_pxe_database.js';
import { type OutgoingNoteDao } from '../database/outgoing_note_dao.js';
import { ContractDataOracle } from '../index.js';
import { type SimulatorOracle } from './index.js';

const TXS_PER_BLOCK = 4;
const NUM_NOTE_HASHES_PER_BLOCK = TXS_PER_BLOCK * MAX_NOTE_HASHES_PER_TX;

function getRandomNoteLogPayload(tag = Fr.random(), app = AztecAddress.random()): EncryptedLogPayload {
  return new EncryptedLogPayload(tag, app, L1NotePayload.random(app).toIncomingBodyPlaintext());
}

/** A wrapper containing info about a note we want to mock and insert into a block. */
class MockNoteRequest {
  constructor(
    /** Log payload corresponding to a note we want to insert into a block. */
    public readonly logPayload: EncryptedLogPayload,
    /** Block number this note corresponds to. */
    public readonly blockNumber: number,
    /** Index of a tx within a block this note corresponds to. */
    public readonly txIndex: number,
    /** Index of a note hash within a list of note hashes for 1 tx. */
    public readonly noteHashIndex: number,
    /** Address point we use when encrypting a note. */
    public readonly recipient: AztecAddress,
    /** ovKeys we use when encrypting a note. */
    public readonly ovKeys: KeyValidationRequest,
  ) {
    if (blockNumber < INITIAL_L2_BLOCK_NUM) {
      throw new Error(`Block number should be greater than or equal to ${INITIAL_L2_BLOCK_NUM}.`);
    }
    if (noteHashIndex >= MAX_NOTE_HASHES_PER_TX) {
      throw new Error(`Data index should be less than ${MAX_NOTE_HASHES_PER_TX}.`);
    }
    if (txIndex >= TXS_PER_BLOCK) {
      throw new Error(`Tx index should be less than ${TXS_PER_BLOCK}.`);
    }
  }

  encrypt(): EncryptedL2NoteLog {
    const ephSk = GrumpkinScalar.random();
    const log = this.logPayload.encrypt(ephSk, this.recipient, this.ovKeys);
    return new EncryptedL2NoteLog(log);
  }

  get indexWithinNoteHashTree(): bigint {
    return BigInt(
      (this.blockNumber - 1) * NUM_NOTE_HASHES_PER_BLOCK + this.txIndex * MAX_NOTE_HASHES_PER_TX + this.noteHashIndex,
    );
  }

  get snippetOfNoteDao() {
    const payload = L1NotePayload.fromIncomingBodyPlaintextContractAndPublicValues(
      this.logPayload.incomingBodyPlaintext,
      this.logPayload.contractAddress,
      [],
    )!;
    return {
      note: new Note(payload.privateNoteValues),
      contractAddress: payload.contractAddress,
      storageSlot: payload.storageSlot,
      noteTypeId: payload.noteTypeId,
    };
  }
}

function computeTagForIndex(
  sender: { completeAddress: CompleteAddress; ivsk: Fq },
  recipient: AztecAddress,
  contractAddress: AztecAddress,
  index: number,
) {
  const sharedSecret = computeTaggingSecret(sender.completeAddress, sender.ivsk, recipient);
  const siloedSecret = poseidon2Hash([sharedSecret.x, sharedSecret.y, contractAddress]);
  return poseidon2Hash([siloedSecret, recipient, index]);
}

describe('Simulator oracle', () => {
  let aztecNode: MockProxy<AztecNode>;
  let database: PxeDatabase;
  let contractDataOracle: ContractDataOracle;
  let simulatorOracle: SimulatorOracle;
  let keyStore: KeyStore;

  let recipient: CompleteAddress;
  let recipientOvKeys: KeyValidationRequest;
  let contractAddress: AztecAddress;

  beforeEach(async () => {
    const db = openTmpStore();
    aztecNode = mock<AztecNode>();
    database = new KVPxeDatabase(db);
    contractDataOracle = new ContractDataOracle(database);
    keyStore = new KeyStore(db);
    const simulatorOracleModule = await import('../simulator_oracle/index.js');
    simulatorOracle = new simulatorOracleModule.SimulatorOracle(contractDataOracle, database, keyStore, aztecNode);
    // Set up contract address
    contractAddress = AztecAddress.random();
    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    const recipientOvskApp = await keyStore.getAppOutgoingViewingSecretKey(recipient.address, contractAddress);
    await database.addCompleteAddress(recipient);
    recipientOvKeys = new KeyValidationRequest(recipient.publicKeys.masterOutgoingViewingPublicKey, recipientOvskApp);
  });

  describe('sync tagged logs', () => {
    const NUM_SENDERS = 10;
    let senders: { completeAddress: CompleteAddress; ivsk: Fq }[];

    beforeEach(async () => {
      // Set up the address book
      senders = times(NUM_SENDERS).map((_, index) => {
        const keys = deriveKeys(new Fr(index));
        const partialAddress = Fr.random();
        const address = computeAddress(keys.publicKeys, partialAddress);
        const completeAddress = new CompleteAddress(address, keys.publicKeys, partialAddress);
        return { completeAddress, ivsk: keys.masterIncomingViewingSecretKey };
      });
      for (const sender of senders) {
        await database.addContactAddress(sender.completeAddress.address);
      }

      const logs: { [k: string]: TxScopedEncryptedL2NoteLog[] } = {};

      // Add a random note from every address in the address book for our account with index 0
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (const sender of senders) {
        const tag = computeTagForIndex(sender, recipient.address, contractAddress, 0);
        const randomNote = new MockNoteRequest(
          getRandomNoteLogPayload(tag, contractAddress),
          1,
          1,
          1,
          recipient.address,
          recipientOvKeys,
        );
        const log = new TxScopedEncryptedL2NoteLog(TxHash.random(), 0, randomNote.encrypt());
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS

      // Add a random note from the first sender in the address book, repeating the tag
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      const firstSender = senders[0];
      const tag = computeTagForIndex(firstSender, recipient.address, contractAddress, 0);
      const log = new TxScopedEncryptedL2NoteLog(TxHash.random(), 0, EncryptedL2NoteLog.random(tag));
      logs[tag.toString()].push(log);
      // Accumulated logs intended for recipient: NUM_SENDERS + 1

      // Add a random note from half the address book for our account with index 1
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (let i = NUM_SENDERS / 2; i < NUM_SENDERS; i++) {
        const sender = senders[i];
        const tag = computeTagForIndex(sender, recipient.address, contractAddress, 1);
        const randomNote = new MockNoteRequest(
          getRandomNoteLogPayload(tag, contractAddress),
          1,
          1,
          1,
          recipient.address,
          recipientOvKeys,
        );
        const log = new TxScopedEncryptedL2NoteLog(TxHash.random(), 0, randomNote.encrypt());
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

      // Add a random note from every address in the address book for a random recipient with index 0
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (const sender of senders) {
        const keys = deriveKeys(Fr.random());
        const partialAddress = Fr.random();
        const randomRecipient = computeAddress(keys.publicKeys, partialAddress);
        const tag = computeTagForIndex(sender, randomRecipient, contractAddress, 0);
        const randomNote = new MockNoteRequest(
          getRandomNoteLogPayload(tag, contractAddress),
          1,
          1,
          1,
          randomRecipient,
          new KeyValidationRequest(
            keys.publicKeys.masterOutgoingViewingPublicKey,
            computeOvskApp(keys.masterOutgoingViewingSecretKey, contractAddress),
          ),
        );
        const log = new TxScopedEncryptedL2NoteLog(TxHash.random(), 0, randomNote.encrypt());
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

      // Set up the getTaggedLogs mock

      aztecNode.getLogsByTags.mockImplementation(tags => {
        return Promise.resolve(tags.map(tag => logs[tag.toString()] ?? []));
      });
    });

    it('should sync tagged logs', async () => {
      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, recipient.address);
      // We expect to have all logs intended for the recipient, one per sender + 1 with a duplicated tag for the first one + half of the logs for the second index
      expect(syncedLogs).toHaveLength(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated

      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const directionalSecrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        const siloedSecret = poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
        return new TaggingSecret(siloedSecret, recipient.address);
      });

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders hould also have index 1
      // Last 5 senders should have index 2
      const indexes = await database.getTaggingSecretsIndexes(directionalSecrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    });

    it('should only sync tagged logs for which indexes are not updated', async () => {
      // Recompute the secrets (as recipient) to update indexes

      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const directionalSecrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        const siloedSecret = poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
        return new TaggingSecret(siloedSecret, recipient.address);
      });

      await database.incrementTaggingSecretsIndexes(directionalSecrets);

      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, recipient.address);

      // Only half of the logs should be synced since we start from index 1, the other half should be skipped
      expect(syncedLogs).toHaveLength(NUM_SENDERS / 2);

      // We should have called the node twice, once for index 1 and once for index 2 (which should return no logs)
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2);
    });
  });

  describe('Process notes', () => {
    let addNotesSpy: any;
    let simulator: MockProxy<AcirSimulator>;

    beforeEach(() => {
      addNotesSpy = jest.spyOn(database, 'addNotes');
      simulator = mock<AcirSimulator>();
      simulator.computeNoteHashAndOptionallyANullifier.mockImplementation((...args: any) =>
        Promise.resolve({
          noteHash: Fr.random(),
          uniqueNoteHash: Fr.random(),
          siloedNoteHash: pedersenHash(args[5].items), // args[5] is note
          innerNullifier: Fr.random(),
        }),
      );
    });

    afterEach(() => {
      addNotesSpy.mockReset();
      simulator.computeNoteHashAndOptionallyANullifier.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    function mockTaggedLogs(requests: MockNoteRequest[]) {
      const txEffectsMap: { [k: string]: { noteHashes: Fr[]; txHash: TxHash } } = {};
      const taggedLogs: TxScopedEncryptedL2NoteLog[] = [];
      const groupedByTx = requests.reduce<{ [i: number]: { [j: number]: MockNoteRequest[] } }>((acc, request) => {
        if (!acc[request.blockNumber]) {
          acc[request.blockNumber] = {};
        }
        if (!acc[request.blockNumber][request.txIndex]) {
          acc[request.blockNumber][request.txIndex] = [];
        }
        acc[request.blockNumber][request.txIndex].push(request);
        return acc;
      }, {});
      Object.keys(groupedByTx).forEach(blockNumberKey => {
        const blockNumber = parseInt(blockNumberKey);
        Object.keys(groupedByTx[blockNumber]).forEach(txIndexKey => {
          const txIndex = parseInt(txIndexKey);
          const requestsInTx = groupedByTx[blockNumber][txIndex];
          const maxNoteIndex = Math.max(...requestsInTx.map(request => request.noteHashIndex));
          const txHash = TxHash.random();
          for (const request of requestsInTx) {
            if (!txEffectsMap[txHash.toString()]) {
              txEffectsMap[txHash.toString()] = {
                txHash,
                noteHashes: Array(maxNoteIndex + 1)
                  .fill(0)
                  .map(() => Fr.random()),
              };
            }
            const dataStartIndex =
              (request.blockNumber - 1) * NUM_NOTE_HASHES_PER_BLOCK + request.txIndex * MAX_NOTE_HASHES_PER_TX;
            const taggedLog = new TxScopedEncryptedL2NoteLog(txHash, dataStartIndex, request.encrypt());
            const note = request.snippetOfNoteDao.note;
            const noteHash = pedersenHash(note.items);
            txEffectsMap[txHash.toString()].noteHashes[request.noteHashIndex] = noteHash;
            taggedLogs.push(taggedLog);
          }
        });
      });

      aztecNode.getTxEffect.mockImplementation(txHash => {
        return Promise.resolve(txEffectsMap[txHash.toString()] as TxEffect);
      });
      return taggedLogs;
    }

    it('should store an incoming note that belongs to us', async () => {
      const request = new MockNoteRequest(
        getRandomNoteLogPayload(Fr.random(), contractAddress),
        4,
        0,
        2,
        recipient.address,
        KeyValidationRequest.random(),
      );
      const taggedLogs = mockTaggedLogs([request]);

      await simulatorOracle.processTaggedLogs(taggedLogs, recipient.address, simulator);

      expect(addNotesSpy).toHaveBeenCalledTimes(1);
      expect(addNotesSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            ...request.snippetOfNoteDao,
            index: request.indexWithinNoteHashTree,
          }),
        ],
        [],
        recipient.address,
      );
    }, 25_000);

    it('should store an outgoing note that belongs to us', async () => {
      const request = new MockNoteRequest(
        getRandomNoteLogPayload(Fr.random(), contractAddress),
        4,
        0,
        2,
        CompleteAddress.random().address,
        recipientOvKeys,
      );

      const taggedLogs = mockTaggedLogs([request]);

      await simulatorOracle.processTaggedLogs(taggedLogs, recipient.address, simulator);

      expect(addNotesSpy).toHaveBeenCalledTimes(1);
      // For outgoing notes, the resulting DAO does not contain index.
      expect(addNotesSpy).toHaveBeenCalledWith(
        [],
        [expect.objectContaining(request.snippetOfNoteDao)],
        recipient.address,
      );
    }, 25_000);

    it('should store multiple notes that belong to us', async () => {
      const requests = [
        new MockNoteRequest(
          getRandomNoteLogPayload(Fr.random(), contractAddress),
          1,
          1,
          1,
          recipient.address,
          recipientOvKeys,
        ),
        new MockNoteRequest(
          getRandomNoteLogPayload(Fr.random(), contractAddress),
          2,
          3,
          0,
          CompleteAddress.random().address,
          recipientOvKeys,
        ),
        new MockNoteRequest(
          getRandomNoteLogPayload(Fr.random(), contractAddress),
          6,
          3,
          2,
          recipient.address,
          KeyValidationRequest.random(),
        ),
        new MockNoteRequest(
          getRandomNoteLogPayload(Fr.random(), contractAddress),
          9,
          3,
          2,
          CompleteAddress.random().address,
          KeyValidationRequest.random(),
        ),
        new MockNoteRequest(
          getRandomNoteLogPayload(Fr.random(), contractAddress),
          12,
          3,
          2,
          recipient.address,
          recipientOvKeys,
        ),
      ];

      const taggedLogs = mockTaggedLogs(requests);

      await simulatorOracle.processTaggedLogs(taggedLogs, recipient.address, simulator);

      expect(addNotesSpy).toHaveBeenCalledTimes(1);
      expect(addNotesSpy).toHaveBeenCalledWith(
        // Incoming should contain notes from requests 0, 2, 4 because in those requests we set owner address point.
        [
          expect.objectContaining({
            ...requests[0].snippetOfNoteDao,
            index: requests[0].indexWithinNoteHashTree,
          }),
          expect.objectContaining({
            ...requests[2].snippetOfNoteDao,
            index: requests[2].indexWithinNoteHashTree,
          }),
          expect.objectContaining({
            ...requests[4].snippetOfNoteDao,
            index: requests[4].indexWithinNoteHashTree,
          }),
        ],
        // Outgoing should contain notes from requests 0, 1, 4 because in those requests we set owner ovKeys.
        [
          expect.objectContaining(requests[0].snippetOfNoteDao),
          expect.objectContaining(requests[1].snippetOfNoteDao),
          expect.objectContaining(requests[4].snippetOfNoteDao),
        ],
        recipient.address,
      );
    }, 30_000);

    it('should not store notes that do not belong to us', async () => {
      // Both notes should be ignored because the encryption keys do not belong to owner (they are random).
      const requests = [
        new MockNoteRequest(
          getRandomNoteLogPayload(),
          2,
          1,
          1,
          CompleteAddress.random().address,
          KeyValidationRequest.random(),
        ),
        new MockNoteRequest(
          getRandomNoteLogPayload(),
          2,
          3,
          0,
          CompleteAddress.random().address,
          KeyValidationRequest.random(),
        ),
      ];

      const taggedLogs = mockTaggedLogs(requests);

      await simulatorOracle.processTaggedLogs(taggedLogs, recipient.address, simulator);

      expect(addNotesSpy).toHaveBeenCalledTimes(0);
    });

    it('should be able to recover two note payloads containing the same note', async () => {
      const note = getRandomNoteLogPayload(Fr.random(), contractAddress);
      const note2 = getRandomNoteLogPayload(Fr.random(), contractAddress);
      // All note payloads except one have the same contract address, storage slot, and the actual note.
      const requests = [
        new MockNoteRequest(note, 3, 0, 0, recipient.address, recipientOvKeys),
        new MockNoteRequest(note, 4, 0, 2, recipient.address, recipientOvKeys),
        new MockNoteRequest(note, 4, 2, 0, recipient.address, recipientOvKeys),
        new MockNoteRequest(note2, 5, 2, 1, recipient.address, recipientOvKeys),
        new MockNoteRequest(note, 6, 2, 3, recipient.address, recipientOvKeys),
      ];

      const taggedLogs = mockTaggedLogs(requests);

      await simulatorOracle.processTaggedLogs(taggedLogs, recipient.address, simulator);

      // First we check incoming
      {
        const addedIncoming: IncomingNoteDao[] = addNotesSpy.mock.calls[0][0];
        expect(addedIncoming.map(dao => dao)).toEqual([
          expect.objectContaining({ ...requests[0].snippetOfNoteDao, index: requests[0].indexWithinNoteHashTree }),
          expect.objectContaining({ ...requests[1].snippetOfNoteDao, index: requests[1].indexWithinNoteHashTree }),
          expect.objectContaining({ ...requests[2].snippetOfNoteDao, index: requests[2].indexWithinNoteHashTree }),
          expect.objectContaining({ ...requests[3].snippetOfNoteDao, index: requests[3].indexWithinNoteHashTree }),
          expect.objectContaining({ ...requests[4].snippetOfNoteDao, index: requests[4].indexWithinNoteHashTree }),
        ]);

        // Check that every note has a different nonce.
        const nonceSet = new Set<bigint>();
        addedIncoming.forEach(info => nonceSet.add(info.nonce.value));
        expect(nonceSet.size).toBe(requests.length);
      }

      // Then we check outgoing
      {
        const addedOutgoing: OutgoingNoteDao[] = addNotesSpy.mock.calls[0][1];
        expect(addedOutgoing.map(dao => dao)).toEqual([
          expect.objectContaining(requests[0].snippetOfNoteDao),
          expect.objectContaining(requests[1].snippetOfNoteDao),
          expect.objectContaining(requests[2].snippetOfNoteDao),
          expect.objectContaining(requests[3].snippetOfNoteDao),
          expect.objectContaining(requests[4].snippetOfNoteDao),
        ]);

        // Outgoing note daos do not have a nonce so we don't check it.
      }
    });
  });
});
