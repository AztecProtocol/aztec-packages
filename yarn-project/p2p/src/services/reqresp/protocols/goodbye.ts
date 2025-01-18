import { createLogger } from '@aztec/foundation/log';

import { type PeerId } from '@libp2p/interface';

import { type PeerManager } from '../../peer-manager/peer_manager.js';
import { ReqRespSubProtocol, type ReqRespSubProtocolHandler } from '../interface.js';
import { type ReqResp } from '../reqresp.js';

/**
 * Enum defining the possible reasons for a goodbye message.
 */
export enum GoodByeReason {
  /** The peer has shutdown, will be received whenever a peer's node is routinely stopped */
  SHUTDOWN = 0x1,
  /** Whenever the peer must disconnect due to maintaining max peers */
  DISCONNECTED = 0x2,
  /** The peer has a low score, will be received whenever a peer's score is low */
  LOW_SCORE = 0x3,
  /** The peer has been banned, will be received whenever a peer is banned */
  BANNED = 0x4,
  /** Wrong network / fork */
  WRONG_NETWORK = 0x5,
  /** Unknown reason */
  UNKNOWN = 0x6,
}

export function encodeGoodbyeReason(reason: GoodByeReason): Buffer {
  return Buffer.from([reason]);
}

export function decodeGoodbyeReason(buffer: Buffer): GoodByeReason {
  try {
    if (buffer.length !== 1) {
      throw new Error('Invalid goodbye reason buffer length');
    }
    return buffer[0] as GoodByeReason;
  } catch (error) {
    return GoodByeReason.UNKNOWN;
  }
}

/**
 * Pretty prints the goodbye reason.
 * @param reason - The goodbye reason.
 * @returns The pretty printed goodbye reason.
 */
export function prettyGoodbyeReason(reason: GoodByeReason): string {
  switch (reason) {
    case GoodByeReason.SHUTDOWN:
      return 'shutdown';
    case GoodByeReason.DISCONNECTED:
      return 'disconnected';
    case GoodByeReason.LOW_SCORE:
      return 'low_score';
    case GoodByeReason.BANNED:
      return 'banned';
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/11328): implement
    case GoodByeReason.WRONG_NETWORK:
      return 'wrong_network';
    case GoodByeReason.UNKNOWN:
      return 'unknown';
  }
}

/**
 * Handles a goodbye message request
 */
export class GoodbyeProtocolHandler {
  private logger = createLogger('p2p:goodbye-protocol');

  constructor(private reqresp: ReqResp) {}

  public async sendGoodbye(peerId: PeerId, reason: GoodByeReason): Promise<void> {
    try {
      await this.reqresp.sendRequestToPeer(peerId, ReqRespSubProtocol.GOODBYE, Buffer.from([reason]));
      this.logger.debug(`Sent goodbye to peer ${peerId.toString()} with reason ${reason}`);
    } catch (error) {
      this.logger.debug(`Failed to send goodbye to peer ${peerId.toString()}: ${error}`);
    }
  }
}

/**
 * Handles the goodbye request.
 * @param _msg - The goodbye request message.
 * @returns A resolved promise with the goodbye response.
 */
export function reqGoodbyeHandler(peerManager: PeerManager): ReqRespSubProtocolHandler {
  return (peerId: PeerId, _msg: Buffer) => {
    const reason = decodeGoodbyeReason(_msg);

    peerManager.goodbyeReceived(peerId, reason);

    // Return a buffer of length 1 as an acknowledgement
    return Promise.resolve(Buffer.from([0x0]));
  };
}
