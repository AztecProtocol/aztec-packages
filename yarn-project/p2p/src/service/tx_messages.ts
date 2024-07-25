import { EncryptedNoteTxL2Logs, EncryptedTxL2Logs, Tx, UnencryptedTxL2Logs } from '@aztec/circuit-types';
import { ClientIvcProof, PrivateKernelTailCircuitPublicInputs, PublicCallRequest } from '@aztec/circuits.js';
import { numToUInt32BE } from '@aztec/foundation/serialize';

import { type SemVer } from 'semver';
import { createMessageComponent, createMessageComponents, toObject, toObjectArray } from './p2p_serde.js';

export const TX_MESSAGE_TOPIC = '';

// NOTE(Md): I think that all of this code could be wrapped in a serialize / deserialize interface that can be implemented for all messages
// With a message type index that tells the general implementation how to encode / decode messages - wait, this is what the topic really does
export class AztecTxMessageCreator {
  private readonly topic: string;
  constructor(version: SemVer) {
    this.topic = `/aztec/tx/${version.toString()}`;
  }

  createTxMessage(tx: Tx) {
    const messageData = toTxMessage(tx);

    return { topic: this.topic, data: messageData };
  }

  getTopic() {
    return this.topic;
  }
}

/**
 * Decode a POOLED_TRANSACTIONS message into the original transaction objects.
 * @param message - The binary message to be decoded.
 * @returns - The array of transactions originally encoded into the message.
 */
export function decodeTransactionsMessage(message: Buffer) {
  const lengthSize = 4;
  let offset = 0;
  const txs: Tx[] = [];
  while (offset < message.length) {
    const dataSize = message.readUInt32BE(offset);
    const totalSizeOfMessage = lengthSize + dataSize;
    txs.push(fromTxMessage(message.subarray(offset, offset + totalSizeOfMessage)));
    offset += totalSizeOfMessage;
  }
  return txs;
}

/**
 * Creates a tx 'message' for sending to a peer.
 * @param tx - The transaction to convert to a message.
 * @returns - The message.
 */
export function toTxMessage(tx: Tx): Buffer {
  // eslint-disable-next-line jsdoc/require-jsdoc
  // TODO(md): Why is this different than the classic serde for sending over the wire through the cbinds??
  const messageBuffer = Buffer.concat([
    createMessageComponent(tx.data),
    createMessageComponent(tx.clientIvcProof),
    createMessageComponent(tx.noteEncryptedLogs),
    createMessageComponent(tx.encryptedLogs),
    createMessageComponent(tx.unencryptedLogs),
    createMessageComponents(tx.enqueuedPublicFunctionCalls),
    createMessageComponent(tx.publicTeardownFunctionCall),
  ]);
  const messageLength = numToUInt32BE(messageBuffer.length);
  return Buffer.concat([messageLength, messageBuffer]);
}

/**
 * Reproduces a transaction from a transaction 'message'
 * @param buffer - The message buffer to convert to a tx.
 * @returns - The reproduced transaction.
 */
export function fromTxMessage(buffer: Buffer): Tx {
  // this is the opposite of the 'toMessage' function
  // so the first 4 bytes is the complete length, skip it
  const publicInputs = toObject(buffer.subarray(4), PrivateKernelTailCircuitPublicInputs);
  const clientIvcProof = toObject(publicInputs.remainingData, ClientIvcProof);

  const noteEncryptedLogs = toObject(clientIvcProof.remainingData, EncryptedNoteTxL2Logs);
  if (!noteEncryptedLogs.obj) {
    noteEncryptedLogs.obj = new EncryptedNoteTxL2Logs([]);
  }
  const encryptedLogs = toObject(noteEncryptedLogs.remainingData, EncryptedTxL2Logs);
  if (!encryptedLogs.obj) {
    encryptedLogs.obj = new EncryptedTxL2Logs([]);
  }
  const unencryptedLogs = toObject(encryptedLogs.remainingData, UnencryptedTxL2Logs);
  if (!unencryptedLogs.obj) {
    unencryptedLogs.obj = new UnencryptedTxL2Logs([]);
  }

  const publicCalls = toObjectArray(unencryptedLogs.remainingData, PublicCallRequest);

  const publicTeardownCall = toObject(publicCalls.remainingData, PublicCallRequest);
  return new Tx(
    publicInputs.obj!,
    clientIvcProof.obj!,
    noteEncryptedLogs.obj,
    encryptedLogs.obj,
    unencryptedLogs.obj,
    publicCalls.objects,
    publicTeardownCall.obj!,
  );
}
