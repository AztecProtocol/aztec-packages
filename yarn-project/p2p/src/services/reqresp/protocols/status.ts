import { BlockNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import type { Logger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';
import type { WorldStateSyncStatus, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';

import type { PeerId } from '@libp2p/interface';

import { MAX_BLOCK_HASH_STRING_LENGTH, MAX_VERSION_STRING_LENGTH } from '../constants.js';

/*
 * P2P Status Message
 * It is used to establish Status handshake between to peers
 * By validating Status handshake we ensure peers are on the same Blockchain fork
 * And get peer sync status
 */
export class StatusMessage {
  constructor(
    readonly compressedComponentsVersion: string,
    readonly latestBlockNumber: BlockNumber,
    readonly latestBlockHash: string,
    readonly finalizedBlockNumber: BlockNumber,
  ) {
    //TODO: add finalizedBlockHash
    //readonly finalizedBlockHash: string,
  }

  /**
   * Deserializes the StatusMessage object from a Buffer.
   * @param buffer - Buffer or BufferReader object to deserialize.
   * @returns An instance of StatusMessage.
   */
  static fromBuffer(buffer: Buffer | BufferReader): StatusMessage {
    const reader = BufferReader.asReader(buffer);
    return new StatusMessage(
      reader.readString(MAX_VERSION_STRING_LENGTH), // compressedComponentsVersion
      BlockNumber(reader.readNumber()), // latestBlockNumber
      reader.readString(MAX_BLOCK_HASH_STRING_LENGTH), // latestBlockHash
      BlockNumber(reader.readNumber()), // finalizedBlockNumber
      //TODO: add finalizedBlockHash
      //reader.readString(MAX_BLOCK_HASH_STRING_LENGTH), // finalizedBlockHash
    );
  }

  /**
   * Serializes the StatusMessage object into a Buffer.
   * @returns Buffer representation of the StatusMessage object.
   */
  toBuffer() {
    return serializeToBuffer([
      this.compressedComponentsVersion,
      this.latestBlockNumber,
      this.latestBlockHash,
      this.finalizedBlockNumber,
      //TODO: add finalizedBlockHash
      // this.finalizedBlockHash,
    ]);
  }

  /**
   * Builds Status message
   * @param  version - Compressed Components Version
   * @param  worldStateSyncStatus - Info about the current sync status
   * @returns StatusMessage instance
   */
  static fromWorldStateSyncStatus(version: string, syncStatus: WorldStateSyncStatus): StatusMessage {
    return new StatusMessage(
      version,
      BlockNumber(syncStatus.latestBlockNumber),
      syncStatus.latestBlockHash,
      BlockNumber(syncStatus.finalizedBlockNumber),
      //TODO: add finalizedBlockHash
    );
  }

  static random(): StatusMessage {
    return new StatusMessage(
      '1.0.0',
      BlockNumber(Math.floor(Math.random() * 100)),
      Buffer32.random().toString(),
      BlockNumber(Math.floor(Math.random() * 100)),
      //TODO: add finalizedBlockHash
    );
  }

  validate(peerStatus: StatusMessage): boolean {
    // TODO: Validate other fields as well
    return this.compressedComponentsVersion === peerStatus.compressedComponentsVersion;
  }

  equals(other: StatusMessage): boolean {
    return (
      this.compressedComponentsVersion === other.compressedComponentsVersion &&
      this.latestBlockNumber === other.latestBlockNumber &&
      this.latestBlockHash === other.latestBlockHash &&
      this.finalizedBlockNumber === other.finalizedBlockNumber
    );
  }
}

/**
 * Handles the status request. By immediately responding  with the current node status.
 * @param compressedComponentsVersion - Compressed Components Version
 * @param worldStateSynchronizer - World State Synchronizer to fetch the sync status from.
 * Note the WorldStateSynchronizer must be injected to fetch the fresh sync status, we cannot pass in pre-built StatusMessage.
 * @returns Status message handler
 */
export function reqRespStatusHandler(
  compressedComponentsVersion: string,
  worldStateSynchronizer: WorldStateSynchronizer,
  logger?: Logger,
) {
  return async (peerId: PeerId, _msg: Buffer) => {
    logger?.trace(`Received status handshake request from ${peerId}`);
    const status = StatusMessage.fromWorldStateSyncStatus(
      compressedComponentsVersion,
      (await worldStateSynchronizer.status()).syncSummary,
    );
    const response = status.toBuffer();
    logger?.trace(`Responding status handshake from ${peerId}`, { data: bufferToHex(response) });
    return response;
  };
}
