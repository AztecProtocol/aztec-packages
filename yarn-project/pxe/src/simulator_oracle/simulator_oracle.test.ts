import {
  type AztecNode,
  EncryptedLogPayload,
  L1NotePayload,
  Note,
  type TxEffect,
  TxHash,
  TxScopedL2Log,
  randomInBlock,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  type Fq,
  Fr,
  GrumpkinScalar,
  INITIAL_L2_BLOCK_NUM,
  IndexedTaggingSecret,
  MAX_NOTE_HASHES_PER_TX,
  computeAddress,
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
import { ContractDataOracle } from '../index.js';
import { SimulatorOracle } from './index.js';

const TXS_PER_BLOCK = 4;
const NUM_NOTE_HASHES_PER_BLOCK = TXS_PER_BLOCK * MAX_NOTE_HASHES_PER_TX;

jest.setTimeout(30_000);

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

  encrypt(): Buffer {
    const ephSk = GrumpkinScalar.random();
    const log = this.logPayload.generatePayload(ephSk, this.recipient);
    return log.toBuffer();
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

function computeSiloedTagForIndex(
  sender: { completeAddress: CompleteAddress; ivsk: Fq },
  recipient: AztecAddress,
  contractAddress: AztecAddress,
  index: number,
) {
  const sharedSecret = computeTaggingSecret(sender.completeAddress, sender.ivsk, recipient);
  const siloedSecret = poseidon2Hash([sharedSecret.x, sharedSecret.y, contractAddress]);
  const tag = poseidon2Hash([siloedSecret, recipient, index]);
  return poseidon2Hash([contractAddress, tag]);
}

describe('Simulator oracle', () => {
  let aztecNode: MockProxy<AztecNode>;
  let database: PxeDatabase;
  let contractDataOracle: ContractDataOracle;
  let simulatorOracle: SimulatorOracle;
  let keyStore: KeyStore;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  beforeEach(async () => {
    const db = openTmpStore();
    aztecNode = mock<AztecNode>();
    database = new KVPxeDatabase(db);
    contractDataOracle = new ContractDataOracle(database);
    jest.spyOn(contractDataOracle, 'getDebugContractName').mockImplementation(() => Promise.resolve('TestContract'));
    keyStore = new KeyStore(db);
    simulatorOracle = new SimulatorOracle(contractDataOracle, database, keyStore, aztecNode);
    // Set up contract address
    contractAddress = AztecAddress.random();
    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await database.addCompleteAddress(recipient);
  });

  describe('sync tagged logs', () => {
    const NUM_SENDERS = 10;
    const SENDER_OFFSET_WINDOW_SIZE = 10;
    let senders: { completeAddress: CompleteAddress; ivsk: Fq; secretKey: Fr }[];

    function generateMockLogs(senderOffset: number) {
      const logs: { [k: string]: TxScopedL2Log[] } = {};

      // Add a random note from every address in the address book for our account with index senderOffset
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (const sender of senders) {
        const tag = computeSiloedTagForIndex(sender, recipient.address, contractAddress, senderOffset);
        const blockNumber = 1;
        const randomNote = new MockNoteRequest(
          getRandomNoteLogPayload(tag, contractAddress),
          blockNumber,
          1,
          1,
          recipient.address,
        );
        const log = new TxScopedL2Log(TxHash.random(), 0, blockNumber, false, randomNote.encrypt());
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS

      // Add a random note from the first sender in the address book, repeating the tag
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      const firstSender = senders[0];
      const tag = computeSiloedTagForIndex(firstSender, recipient.address, contractAddress, senderOffset);
      const payload = getRandomNoteLogPayload(tag, contractAddress);
      const logData = payload.generatePayload(GrumpkinScalar.random(), recipient.address).toBuffer();
      const log = new TxScopedL2Log(TxHash.random(), 1, 0, false, logData);
      logs[tag.toString()].push(log);
      // Accumulated logs intended for recipient: NUM_SENDERS + 1

      // Add a random note from half the address book for our account with index senderOffset + 1
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (let i = NUM_SENDERS / 2; i < NUM_SENDERS; i++) {
        const sender = senders[i];
        const tag = computeSiloedTagForIndex(sender, recipient.address, contractAddress, senderOffset + 1);
        const blockNumber = 2;
        const randomNote = new MockNoteRequest(
          getRandomNoteLogPayload(tag, contractAddress),
          blockNumber,
          1,
          1,
          recipient.address,
        );
        const log = new TxScopedL2Log(TxHash.random(), 0, blockNumber, false, randomNote.encrypt());
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

      // Add a random note from every address in the address book for a random recipient with index senderOffset
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (const sender of senders) {
        const keys = deriveKeys(Fr.random());
        const partialAddress = Fr.random();
        const randomRecipient = computeAddress(keys.publicKeys, partialAddress);
        const tag = computeSiloedTagForIndex(sender, randomRecipient, contractAddress, senderOffset);
        const blockNumber = 3;
        const randomNote = new MockNoteRequest(
          getRandomNoteLogPayload(tag, contractAddress),
          blockNumber,
          1,
          1,
          randomRecipient,
        );
        const log = new TxScopedL2Log(TxHash.random(), 0, blockNumber, false, randomNote.encrypt());
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

      // Set up the getTaggedLogs mock

      aztecNode.getLogsByTags.mockImplementation(tags => {
        return Promise.resolve(tags.map(tag => logs[tag.toString()] ?? []));
      });
    }

    beforeEach(async () => {
      // Set up the address book
      senders = times(NUM_SENDERS).map((_, index) => {
        const keys = deriveKeys(new Fr(index));
        const partialAddress = Fr.random();
        const address = computeAddress(keys.publicKeys, partialAddress);
        const completeAddress = new CompleteAddress(address, keys.publicKeys, partialAddress);
        return { completeAddress, ivsk: keys.masterIncomingViewingSecretKey, secretKey: new Fr(index) };
      });
      for (const sender of senders) {
        await database.addContactAddress(sender.completeAddress.address);
      }
      aztecNode.getLogsByTags.mockReset();
    });

    it('should sync tagged logs', async () => {
      const senderOffset = 0;
      generateMockLogs(senderOffset);
      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, 3);
      // We expect to have all logs intended for the recipient, one per sender + 1 with a duplicated tag for the first one + half of the logs for the second index
      expect(syncedLogs.get(recipient.address.toString())).toHaveLength(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated

      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        return poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
      });

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders hould also have index 1 = offset + 1
      // Last 5 senders should have index 2 = offset + 2
      const indexes = await database.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

      // We should have called the node 12 times:
      // 2 times with logs (sliding the window) + 10 times with no results (window size)
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2 + SENDER_OFFSET_WINDOW_SIZE);
    });

    it('should sync tagged logs as senders', async () => {
      for (const sender of senders) {
        await database.addCompleteAddress(sender.completeAddress);
        await keyStore.addAccount(sender.secretKey, sender.completeAddress.partialAddress);
      }

      let senderOffset = 0;
      generateMockLogs(senderOffset);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        return poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
      });

      const indexesAsSender = await database.getTaggingSecretsIndexesAsSender(secrets);
      expect(indexesAsSender).toStrictEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(0);

      for (let i = 0; i < senders.length; i++) {
        await simulatorOracle.syncTaggedLogsAsSender(
          contractAddress,
          senders[i].completeAddress.address,
          recipient.address,
        );
      }

      let indexesAsSenderAfterSync = await database.getTaggingSecretsIndexesAsSender(secrets);
      expect(indexesAsSenderAfterSync).toStrictEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

      // Two windows are fetch for each sender
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(NUM_SENDERS * 2);
      aztecNode.getLogsByTags.mockReset();

      // We add more logs at the end of the window to make sure we only detect them and bump the indexes if it lies within our window
      senderOffset = 10;
      generateMockLogs(senderOffset);
      for (let i = 0; i < senders.length; i++) {
        await simulatorOracle.syncTaggedLogsAsSender(
          contractAddress,
          senders[i].completeAddress.address,
          recipient.address,
        );
      }

      indexesAsSenderAfterSync = await database.getTaggingSecretsIndexesAsSender(secrets);
      expect(indexesAsSenderAfterSync).toStrictEqual([11, 11, 11, 11, 11, 12, 12, 12, 12, 12]);

      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(NUM_SENDERS * 2);
    });

    it('should sync tagged logs with a sender index offset', async () => {
      const senderOffset = 5;
      generateMockLogs(senderOffset);
      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, 3);
      // We expect to have all logs intended for the recipient, one per sender + 1 with a duplicated tag for the first one + half of the logs for the second index
      expect(syncedLogs.get(recipient.address.toString())).toHaveLength(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        return poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
      });

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders hould also have index 6 = offset + 1
      // Last 5 senders should have index 7 = offset + 2
      const indexes = await database.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([6, 6, 6, 6, 6, 7, 7, 7, 7, 7]);

      // We should have called the node 17 times:
      // 5 times with no results (sender offset) + 2 times with logs (sliding the window) + 10 times with no results (window size)
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(5 + 2 + SENDER_OFFSET_WINDOW_SIZE);
    });

    it("should sync tagged logs for which indexes are not updated if they're inside the window", async () => {
      const senderOffset = 1;
      generateMockLogs(senderOffset);

      // Recompute the secrets (as recipient) to update indexes
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        return poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
      });

      // Increase our indexes to 2
      await database.setTaggingSecretsIndexesAsRecipient(secrets.map(secret => new IndexedTaggingSecret(secret, 2)));

      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, 3);

      // Even if our index as recipient is higher than what the sender sent, we should be able to find the logs
      // since the window starts at Math.max(0, 2 - window_size) = 0
      expect(syncedLogs.get(recipient.address.toString())).toHaveLength(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // First sender should have 2 logs, but keep index 2 since they were built using the same tag
      // Next 4 senders hould also have index 2 = offset + 1
      // Last 5 senders should have index 3 = offset + 2
      const indexes = await database.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);

      // We should have called the node 13 times:
      // 1 time without logs + 2 times with logs (sliding the window) + 10 times with no results (window size)
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(3 + SENDER_OFFSET_WINDOW_SIZE);
    });

    it("should not sync tagged logs for which indexes are not updated if they're outside the window", async () => {
      const senderOffset = 0;
      generateMockLogs(senderOffset);

      // Recompute the secrets (as recipient) to update indexes
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        return poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
      });

      await database.setTaggingSecretsIndexesAsRecipient(
        secrets.map(secret => new IndexedTaggingSecret(secret, SENDER_OFFSET_WINDOW_SIZE + 1)),
      );

      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, 3);

      // Only half of the logs should be synced since we start from index 1 = (11 - window_size), the other half should be skipped
      expect(syncedLogs.get(recipient.address.toString())).toHaveLength(NUM_SENDERS / 2);

      // Indexes should remain where we set them (window_size + 1)
      const indexes = await database.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([11, 11, 11, 11, 11, 11, 11, 11, 11, 11]);

      // We should have called the node SENDER_OFFSET_WINDOW_SIZE + 1 (with logs) + SENDER_OFFSET_WINDOW_SIZE:
      // Once for index 1 (NUM_SENDERS/2 logs) + 2 times the sliding window (no logs each time)
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(1 + 2 * SENDER_OFFSET_WINDOW_SIZE);
    });

    it('should sync tagged logs from scratch after a DB wipe', async () => {
      const senderOffset = 0;
      generateMockLogs(senderOffset);

      // Recompute the secrets (as recipient) to update indexes
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        return poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
      });

      await database.setTaggingSecretsIndexesAsRecipient(
        secrets.map(secret => new IndexedTaggingSecret(secret, SENDER_OFFSET_WINDOW_SIZE + 2)),
      );

      let syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, 3);

      // No logs should be synced since we start from index 2 = 12 - window_size
      expect(syncedLogs.get(recipient.address.toString())).toHaveLength(0);
      // We should have called the node 21 times (window size + current_index + window size)
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2 * SENDER_OFFSET_WINDOW_SIZE + 1);

      aztecNode.getLogsByTags.mockClear();

      // Wipe the database
      await database.resetNoteSyncData();

      syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, 3);

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders hould also have index 1 = offset + 1
      // Last 5 senders should have index 2 = offset + 2
      const indexes = await database.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

      // We should have called the node 12 times:
      // 2 times with logs (sliding the window) + 10 times with no results (window size)
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2 + SENDER_OFFSET_WINDOW_SIZE);
    });

    it('should not sync tagged logs with a blockNumber > maxBlockNumber', async () => {
      const senderOffset = 0;
      generateMockLogs(senderOffset);
      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, 1);

      // Only NUM_SENDERS + 1 logs should be synched, since the rest have blockNumber > 1
      expect(syncedLogs.get(recipient.address.toString())).toHaveLength(NUM_SENDERS + 1);
    });
  });

  describe('Process notes', () => {
    let addNotesSpy: any;
    let getIncomingNotesSpy: any;
    let removeNullifiedNotesSpy: any;
    let simulator: MockProxy<AcirSimulator>;

    beforeEach(() => {
      addNotesSpy = jest.spyOn(database, 'addNotes');
      getIncomingNotesSpy = jest.spyOn(database, 'getIncomingNotes');
      removeNullifiedNotesSpy = jest.spyOn(database, 'removeNullifiedNotes');
      removeNullifiedNotesSpy.mockImplementation(() => Promise.resolve([]));
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
      getIncomingNotesSpy.mockReset();
      removeNullifiedNotesSpy.mockReset();
      simulator.computeNoteHashAndOptionallyANullifier.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    function mockTaggedLogs(requests: MockNoteRequest[], nullifiers: number = 0) {
      const txEffectsMap: { [k: string]: { noteHashes: Fr[]; txHash: TxHash } } = {};
      const taggedLogs: TxScopedL2Log[] = [];
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
            const taggedLog = new TxScopedL2Log(txHash, dataStartIndex, blockNumber, false, request.encrypt());
            const note = request.snippetOfNoteDao.note;
            const noteHash = pedersenHash(note.items);
            txEffectsMap[txHash.toString()].noteHashes[request.noteHashIndex] = noteHash;
            taggedLogs.push(taggedLog);
          }
        });
      });

      aztecNode.getTxEffect.mockImplementation(txHash => {
        return Promise.resolve(randomInBlock(txEffectsMap[txHash.toString()] as TxEffect));
      });
      aztecNode.findNullifiersIndexesWithBlock.mockImplementation((_blockNumber, requestedNullifiers) =>
        Promise.resolve(
          Array(requestedNullifiers.length - nullifiers)
            .fill(undefined)
            .concat(Array(nullifiers).fill({ data: 1n, l2BlockNumber: 1n, l2BlockHash: '0x' })),
        ),
      );
      return taggedLogs;
    }

    it('should store an incoming note that belongs to us', async () => {
      const request = new MockNoteRequest(
        getRandomNoteLogPayload(Fr.random(), contractAddress),
        4,
        0,
        2,
        recipient.address,
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
        recipient.address,
      );
    }, 25_000);

    it('should store multiple notes that belong to us', async () => {
      const requests = [
        new MockNoteRequest(getRandomNoteLogPayload(Fr.random(), contractAddress), 1, 1, 1, recipient.address),
        new MockNoteRequest(
          getRandomNoteLogPayload(Fr.random(), contractAddress),
          2,
          3,
          0,
          CompleteAddress.random().address,
        ),
        new MockNoteRequest(getRandomNoteLogPayload(Fr.random(), contractAddress), 6, 3, 2, recipient.address),
        new MockNoteRequest(
          getRandomNoteLogPayload(Fr.random(), contractAddress),
          9,
          3,
          2,
          CompleteAddress.random().address,
        ),
        new MockNoteRequest(getRandomNoteLogPayload(Fr.random(), contractAddress), 12, 3, 2, recipient.address),
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
        recipient.address,
      );
    }, 30_000);

    it('should not store notes that do not belong to us', async () => {
      // Both notes should be ignored because the encryption keys do not belong to owner (they are random).
      const requests = [
        new MockNoteRequest(getRandomNoteLogPayload(), 2, 1, 1, CompleteAddress.random().address),
        new MockNoteRequest(getRandomNoteLogPayload(), 2, 3, 0, CompleteAddress.random().address),
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
        new MockNoteRequest(note, 3, 0, 0, recipient.address),
        new MockNoteRequest(note, 4, 0, 2, recipient.address),
        new MockNoteRequest(note, 4, 2, 0, recipient.address),
        new MockNoteRequest(note2, 5, 2, 1, recipient.address),
        new MockNoteRequest(note, 6, 2, 3, recipient.address),
      ];

      const taggedLogs = mockTaggedLogs(requests);

      await simulatorOracle.processTaggedLogs(taggedLogs, recipient.address, simulator);

      // Check incoming
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
    });

    it('should not store nullified notes', async () => {
      const requests = [
        new MockNoteRequest(getRandomNoteLogPayload(Fr.random(), contractAddress), 1, 1, 1, recipient.address),
        new MockNoteRequest(getRandomNoteLogPayload(Fr.random(), contractAddress), 6, 3, 2, recipient.address),
        new MockNoteRequest(getRandomNoteLogPayload(Fr.random(), contractAddress), 12, 3, 2, recipient.address),
      ];

      const taggedLogs = mockTaggedLogs(requests, 2);

      getIncomingNotesSpy.mockResolvedValueOnce(Promise.resolve(requests.map(request => request.snippetOfNoteDao)));

      await simulatorOracle.processTaggedLogs(taggedLogs, recipient.address, simulator);

      expect(addNotesSpy).toHaveBeenCalledTimes(1);
      expect(addNotesSpy).toHaveBeenCalledWith(
        // Incoming should contain notes from requests 0, 1, 2 because in those requests we set owner address point.
        [
          expect.objectContaining({
            ...requests[0].snippetOfNoteDao,
            index: requests[0].indexWithinNoteHashTree,
          }),
          expect.objectContaining({
            ...requests[1].snippetOfNoteDao,
            index: requests[1].indexWithinNoteHashTree,
          }),
          expect.objectContaining({
            ...requests[2].snippetOfNoteDao,
            index: requests[2].indexWithinNoteHashTree,
          }),
        ],
        recipient.address,
      );

      expect(removeNullifiedNotesSpy).toHaveBeenCalledTimes(1);
    }, 30_000);
  });
});
