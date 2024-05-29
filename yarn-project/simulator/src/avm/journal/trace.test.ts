import { UnencryptedL2Log } from '@aztec/circuit-types';
import { EthAddress, L2ToL1Message, LogHash } from '@aztec/circuits.js';
import { EventSelector } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';

import { WorldStateAccessTrace } from './trace.js';
import { type TracedL1toL2MessageCheck, type TracedNullifier, type TracedNullifierCheck } from './trace_types.js';

describe('world state access trace', () => {
  let trace: WorldStateAccessTrace;

  beforeEach(() => {
    trace = new WorldStateAccessTrace();
  });

  describe('Basic tracing', () => {
    it('Should trace note hash checks', () => {
      const contractAddress = new Fr(1);
      const noteHash = new Fr(2);
      const exists = true;
      const leafIndex = new Fr(42);

      trace.traceNoteHashCheck(contractAddress, noteHash, exists, leafIndex);

      expect(trace.noteHashChecks).toEqual([
        {
          // callPointer: expect.any(Fr),
          storageAddress: contractAddress,
          noteHash: noteHash,
          exists: exists,
          counter: Fr.ZERO, // 0th access
          // endLifetime: expect.any(Fr),
          leafIndex: leafIndex,
        },
      ]);
      expect(trace.getAccessCounter()).toBe(1);
    });
    it('Should trace note hashes', () => {
      const contractAddress = new Fr(1);
      const utxo = new Fr(2);

      trace.traceNewNoteHash(contractAddress, utxo);

      expect(trace.newNoteHashes).toEqual([
        expect.objectContaining({ storageAddress: contractAddress, noteHash: utxo }),
      ]);
      expect(trace.getAccessCounter()).toEqual(1);
    });
    it('Should trace nullifier checks', () => {
      const contractAddress = new Fr(1);
      const utxo = new Fr(2);
      const exists = true;
      const isPending = false;
      const leafIndex = new Fr(42);
      trace.traceNullifierCheck(contractAddress, utxo, exists, isPending, leafIndex);
      const expectedCheck: TracedNullifierCheck = {
        // callPointer: Fr.ZERO,
        storageAddress: contractAddress,
        nullifier: utxo,
        exists: exists,
        counter: Fr.ZERO, // 0th access
        // endLifetime: Fr.ZERO,
        isPending: isPending,
        leafIndex: leafIndex,
      };
      expect(trace.nullifierChecks).toEqual([expectedCheck]);
      expect(trace.getAccessCounter()).toEqual(1);
    });
    it('Should trace nullifiers', () => {
      const contractAddress = new Fr(1);
      const utxo = new Fr(2);
      trace.traceNewNullifier(contractAddress, utxo);
      const expectedNullifier: TracedNullifier = {
        // callPointer: Fr.ZERO,
        storageAddress: contractAddress,
        nullifier: utxo,
        counter: new Fr(0),
        // endLifetime: Fr.ZERO,
      };
      expect(trace.newNullifiers).toEqual([expectedNullifier]);
      expect(trace.getAccessCounter()).toEqual(1);
    });
    it('Should trace L1 To L2 message checks', () => {
      const utxo = new Fr(2);
      const exists = true;
      const leafIndex = new Fr(42);
      trace.traceL1ToL2MessageCheck(utxo, leafIndex, exists);
      const expectedCheck: TracedL1toL2MessageCheck = {
        leafIndex: leafIndex,
        msgHash: utxo,
        exists: exists,
      };
      expect(trace.l1ToL2MessageChecks).toEqual([expectedCheck]);
      expect(trace.getAccessCounter()).toEqual(1);
    });
    it('Should trace new L2 to L1 messages', () => {
      const recipientAddress = EthAddress.fromField(new Fr(1));
      const content = new Fr(2);
      trace.traceL2ToL1Message(recipientAddress, content);
      const msg = new L2ToL1Message(recipientAddress, content, 0);
      expect(trace.newL2ToL1Messages).toEqual([msg]);
      expect(trace.getAccessCounter()).toEqual(1);
    });
    it('Should trace new unencrypted logs', () => {
      const contractAddress = new Fr(1);
      const selector = EventSelector.fromField(new Fr(2));
      const data = Buffer.from('data');
      const ulog = new UnencryptedL2Log(contractAddress, selector, data);
      const hash = Fr.fromBuffer(ulog.hash());

      trace.traceUnencryptedLog(ulog, hash);
      // TODO(6578): explain magic number 4 here
      const tracedHash = new LogHash(hash, 0, new Fr(ulog.length + 4));
      expect(trace.newUnencryptedLogs).toEqual([ulog]);
      expect(trace.newUnencryptedLogsHashes).toEqual([tracedHash]);
      expect(trace.getAccessCounter()).toEqual(1);
    });
  });

  it('Access counter should properly count accesses', () => {
    const contractAddress = new Fr(1);
    const slot = new Fr(2);
    const value = new Fr(1);
    const nullifier = new Fr(20);
    const nullifierExists = false;
    const nullifierIsPending = false;
    const nullifierLeafIndex = Fr.ZERO;
    const noteHash = new Fr(10);
    const noteHashLeafIndex = new Fr(88);
    const noteHashExists = false;
    const msgExists = false;
    const msgLeafIndex = Fr.ZERO;
    const msgHash = new Fr(10);

    let counter = 0;
    trace.tracePublicStorageWrite(contractAddress, slot, value);
    counter++;
    trace.tracePublicStorageRead(contractAddress, slot, value, /*exists=*/ true, /*cached=*/ true);
    counter++;
    trace.traceNoteHashCheck(contractAddress, noteHash, noteHashExists, noteHashLeafIndex);
    counter++;
    trace.traceNewNoteHash(contractAddress, noteHash);
    counter++;
    trace.traceNullifierCheck(contractAddress, nullifier, nullifierExists, nullifierIsPending, nullifierLeafIndex);
    counter++;
    trace.traceNewNullifier(contractAddress, nullifier);
    counter++;
    trace.traceL1ToL2MessageCheck(msgHash, msgLeafIndex, msgExists);
    counter++;
    trace.tracePublicStorageWrite(contractAddress, slot, value);
    counter++;
    trace.tracePublicStorageRead(contractAddress, slot, value, /*exists=*/ true, /*cached=*/ true);
    counter++;
    trace.traceNewNoteHash(contractAddress, noteHash);
    counter++;
    trace.traceNullifierCheck(contractAddress, nullifier, nullifierExists, nullifierIsPending, nullifierLeafIndex);
    counter++;
    trace.traceNewNullifier(contractAddress, nullifier);
    counter++;
    trace.traceL1ToL2MessageCheck(msgHash, msgLeafIndex, msgExists);
    counter++;
    expect(trace.getAccessCounter()).toEqual(counter);
  });

  it.each([true, false])(
    'Should merge two traces together (with rejectIncomingAccruedSubstate=%p',
    rejectIncomingAccruedSubstate => {
      const contractAddress = new Fr(1);
      const slot = new Fr(2);
      const value = new Fr(1);
      const valueT1 = new Fr(2);

      const noteHash = new Fr(10);
      const noteHashExists = false;
      const noteHashLeafIndex = new Fr(88);
      const noteHashT1 = new Fr(11);
      const noteHashExistsT1 = true;
      const noteHashLeafIndexT1 = new Fr(7);

      const nullifierExists = false;
      const nullifierIsPending = false;
      const nullifierLeafIndex = Fr.ZERO;
      const nullifier = new Fr(10);
      const nullifierT1 = new Fr(20);
      const nullifierExistsT1 = true;
      const nullifierIsPendingT1 = false;
      const nullifierLeafIndexT1 = new Fr(42);

      const msgExists = false;
      const msgLeafIndex = Fr.ZERO;
      const msgHash = new Fr(10);
      const msgHashT1 = new Fr(20);
      const msgExistsT1 = true;
      const msgLeafIndexT1 = new Fr(42);

      const newMsgRecipient = EthAddress.fromField(new Fr(666));
      const newMsgContent = new Fr(420);
      const newMsgRecipientT1 = EthAddress.fromField(new Fr(1234));
      const newMsgContentT1 = new Fr(24);

      const newLogSelector = EventSelector.fromField(new Fr(3));
      const newLogData = Buffer.from('data');
      const newLogSelectorT1 = EventSelector.fromField(new Fr(4));
      const newLogDataT1 = Buffer.from('dataT1');
      const newLog = new UnencryptedL2Log(contractAddress, newLogSelector, newLogData);
      const newLogHash = Fr.fromBuffer(newLog.hash());
      const newLogT1 = new UnencryptedL2Log(contractAddress, newLogSelectorT1, newLogDataT1);
      const newLogHashT1 = Fr.fromBuffer(newLogT1.hash());

      const expectedMessageCheck = {
        leafIndex: msgLeafIndex,
        msgHash: msgHash,
        exists: msgExists,
      };
      const expectedMessageCheckT1 = {
        leafIndex: msgLeafIndexT1,
        msgHash: msgHashT1,
        exists: msgExistsT1,
      };

      trace.tracePublicStorageWrite(contractAddress, slot, value);
      trace.tracePublicStorageRead(contractAddress, slot, value, /*exists=*/ true, /*cached=*/ true);
      trace.traceNoteHashCheck(contractAddress, noteHash, noteHashExists, noteHashLeafIndex);
      trace.traceNewNoteHash(contractAddress, noteHash);
      trace.traceNullifierCheck(contractAddress, nullifier, nullifierExists, nullifierIsPending, nullifierLeafIndex);
      trace.traceNewNullifier(contractAddress, nullifier);
      trace.traceL1ToL2MessageCheck(msgHash, msgLeafIndex, msgExists);
      trace.traceL2ToL1Message(newMsgRecipient, newMsgContent);
      trace.traceUnencryptedLog(newLog, newLogHash);

      const childTrace = new WorldStateAccessTrace(trace);
      childTrace.tracePublicStorageWrite(contractAddress, slot, valueT1);
      childTrace.tracePublicStorageRead(contractAddress, slot, valueT1, /*exists=*/ true, /*cached=*/ true);
      childTrace.traceNoteHashCheck(contractAddress, noteHashT1, noteHashExistsT1, noteHashLeafIndexT1);
      childTrace.traceNewNoteHash(contractAddress, nullifierT1);
      childTrace.traceNullifierCheck(
        contractAddress,
        nullifierT1,
        nullifierExistsT1,
        nullifierIsPendingT1,
        nullifierLeafIndexT1,
      );
      childTrace.traceNewNullifier(contractAddress, nullifierT1);
      childTrace.traceL1ToL2MessageCheck(msgHashT1, msgLeafIndexT1, msgExistsT1);
      childTrace.traceL2ToL1Message(newMsgRecipientT1, newMsgContentT1);
      childTrace.traceUnencryptedLog(newLogT1, newLogHashT1);

      const childCounterBeforeMerge = childTrace.getAccessCounter();
      trace.merge(childTrace, rejectIncomingAccruedSubstate);
      expect(trace.getAccessCounter()).toEqual(childCounterBeforeMerge);

      expect(trace.publicStorageReads).toEqual([
        expect.objectContaining({
          storageAddress: contractAddress,
          slot: slot,
          value: value,
          exists: true,
          cached: true,
        }),
        expect.objectContaining({
          storageAddress: contractAddress,
          slot: slot,
          value: valueT1,
          exists: true,
          cached: true,
        }),
      ]);
      expect(trace.publicStorageWrites).toEqual([
        expect.objectContaining({ storageAddress: contractAddress, slot: slot, value: value }),
        expect.objectContaining({ storageAddress: contractAddress, slot: slot, value: valueT1 }),
      ]);
      expect(trace.newNoteHashes).toEqual([
        expect.objectContaining({
          storageAddress: contractAddress,
          noteHash: nullifier,
        }),
        expect.objectContaining({
          storageAddress: contractAddress,
          noteHash: nullifierT1,
        }),
      ]);
      expect(trace.newNullifiers).toEqual([
        expect.objectContaining({
          storageAddress: contractAddress,
          nullifier: nullifier,
        }),
        expect.objectContaining({
          storageAddress: contractAddress,
          nullifier: nullifierT1,
        }),
      ]);
      expect(trace.nullifierChecks).toEqual([
        expect.objectContaining({
          nullifier: nullifier,
          exists: nullifierExists,
          isPending: nullifierIsPending,
          leafIndex: nullifierLeafIndex,
        }),
        expect.objectContaining({
          nullifier: nullifierT1,
          exists: nullifierExistsT1,
          isPending: nullifierIsPendingT1,
          leafIndex: nullifierLeafIndexT1,
        }),
      ]);
      expect(trace.noteHashChecks).toEqual([
        expect.objectContaining({ noteHash: noteHash, exists: noteHashExists, leafIndex: noteHashLeafIndex }),
        expect.objectContaining({ noteHash: noteHashT1, exists: noteHashExistsT1, leafIndex: noteHashLeafIndexT1 }),
      ]);
      expect(
        trace.l1ToL2MessageChecks.map(c => ({
          leafIndex: c.leafIndex,
          msgHash: c.msgHash,
          exists: c.exists,
        })),
      ).toEqual([expectedMessageCheck, expectedMessageCheckT1]);
      expect(trace.l1ToL2MessageChecks).toEqual([
        expect.objectContaining({ leafIndex: msgLeafIndex, msgHash: msgHash, exists: msgExists }),
        expect.objectContaining({ leafIndex: msgLeafIndexT1, msgHash: msgHashT1, exists: msgExistsT1 }),
      ]);

      if (rejectIncomingAccruedSubstate) {
        expect(trace.newL2ToL1Messages).toEqual([
          expect.objectContaining({ recipient: newMsgRecipient, content: newMsgContent }),
        ]);
        expect(trace.newUnencryptedLogs).toEqual([
          expect.objectContaining({ contractAddress: contractAddress, selector: newLogSelector, data: newLogData }),
        ]);
      } else {
        expect(trace.newL2ToL1Messages).toEqual([
          expect.objectContaining({ recipient: newMsgRecipient, content: newMsgContent }),
          expect.objectContaining({ recipient: newMsgRecipientT1, content: newMsgContentT1 }),
        ]);
        expect(trace.newUnencryptedLogs).toEqual([
          expect.objectContaining({ contractAddress: contractAddress, selector: newLogSelector, data: newLogData }),
          expect.objectContaining({ contractAddress: contractAddress, selector: newLogSelectorT1, data: newLogDataT1 }),
        ]);
      }
    },
  );
});
