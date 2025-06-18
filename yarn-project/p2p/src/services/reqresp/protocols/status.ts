import type { Logger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';
import type { WorldStateSyncStatus, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';

import type { PeerId } from '@libp2p/interface';

/*
 * P2P Status Message
 * It is used to establish Status handshake between to peers
 * By validating Status handshake we ensure peers are on the same Blockchain fork
 * And get peer sync status
 */
export class StatusMessage {
  constructor(
    readonly compressedComponentsVersion: string,
    readonly latestBlockNumber: number,
    readonly latestBlockHash: string,
    readonly finalisedBlockNumber: number,
    //TODO: add finalisedBlockHash
    //readonly finalisedBlockHash: string,
  ) {}

  /**
   * Deserializes the StatusMessage object from a Buffer.
   * @param buffer - Buffer or BufferReader object to deserialize.
   * @returns An instance of StatusMessage.
   */
  static fromBuffer(buffer: Buffer | BufferReader): StatusMessage {
    const reader = BufferReader.asReader(buffer);
    return new StatusMessage(
      reader.readString(), // compressedComponentsVersion
      reader.readNumber(), // latestBlockNumber
      reader.readString(), // latestBlockHash
      reader.readNumber(), // finalisedBlockNumber
      //TODO: add finalisedBlockHash
      //reader.readString(), // finalisedBlockHash
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
      this.finalisedBlockNumber,
      //TODO: add finalisedBlockHash
      // this.finalisedBlockHash,
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
      syncStatus.latestBlockNumber,
      syncStatus.latestBlockHash,
      syncStatus.finalisedBlockNumber,
      //TODO: add finalisedBlockHash
    );
  }

  validate(peerStatus: StatusMessage): boolean {
    // TODO: Validate other fields as well
    return this.compressedComponentsVersion === peerStatus.compressedComponentsVersion;
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
