import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
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
    readonly finalisedBlockHash: string,
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
      reader.readString(), // finalisedBlockHash
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
      this.finalisedBlockHash,
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
      syncStatus.latestBlockHash,
    );
  }

  validate(peerStatus: StatusMessage): boolean {
    // TODO: Validate other fields as well
    return this.compressedComponentsVersion === peerStatus.compressedComponentsVersion;
  }
}

/**
 * Handles the status request.
 * If validation of peer's status message passed response is also status message
 * If validation didn't pass we respond with a response which isn't status message
 *  The way protocol is designed, the peer will disconnect from us in case of invalid response
 * @param compressedComponentsVersion - Compressed Components Version
 * @param worldStateSynchronizer - World State Synchronizer to fetch the sync status from.
 * Note the WorldStateSynchronizer must be injected to fetch the fresh sync status, we cannot pass in pre-built StatusMessage.
 * @returns Status message handler
 */
export function reqRespStatusHandler(
  compressedComponentsVersion: string,
  worldStateSynchronizer: WorldStateSynchronizer,
) {
  return async (_peerId: PeerId, msg: Buffer) => {
    const invalidStatusResponse = Promise.resolve(Buffer.from([0x0]));
    try {
      const peerStatus = StatusMessage.fromBuffer(msg);
      const ourStatus = StatusMessage.fromWorldStateSyncStatus(
        compressedComponentsVersion,
        (await worldStateSynchronizer.status()).syncSummary,
      );
      // TODO: We should disconnect from the peer if the status is invalid
      // TODO: should we really return invalid RESP and not status message? - think about the crawler
      return ourStatus.validate(peerStatus) ? Promise.resolve(ourStatus.toBuffer()) : invalidStatusResponse;
    } catch {
      return invalidStatusResponse;
    }
  };
}
