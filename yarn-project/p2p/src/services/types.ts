/***************************************************
 *                    Events
 ***************************************************/

/**
 * Events emitted from the libp2p node.
 */
export enum PeerEvent {
  DISCOVERED = 'peer:discovered',
  CONNECTED = 'peer:connect',
  DISCONNECTED = 'peer:disconnect',
}

/**
 * Events emitted from the Discv5 service.
 */
export enum Discv5Event {
  DISCOVERED = 'discovered',
  ENR_ADDED = 'enrAdded',
}

/**
 * Events emitted from the GossipSub protocol.
 */
export enum GossipSubEvent {
  MESSAGE = 'gossipsub:message',
}

/***************************************************
 *                    Types
 ***************************************************/
/**
 * Aztec network specific types
 */
export const AZTEC_ENR_KEY = 'aztec_network';

export enum AztecENR {
  devnet = 0x01,
  testnet = 0x02,
  mainnet = 0x03,
}

// TODO: Make this an env var
export const AZTEC_NET = AztecENR.devnet;
