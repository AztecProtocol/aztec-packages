import type { BlockAttestation, EthAddress } from '@aztec/circuit-types';
import { Signature } from '@aztec/foundation/eth-signature';

export enum SequencerState {
  /**
   * Sequencer is stopped and not processing any txs from the pool.
   */
  STOPPED = 'STOPPED',
  /**
   * Sequencer is awaiting the next call to work().
   */
  IDLE = 'IDLE',
  /**
   * Synchronizing with the L2 chain.
   */
  SYNCHRONIZING = 'SYNCHRONIZING',
  /**
   * Checking if we are the proposer for the current slot.
   */
  PROPOSER_CHECK = 'PROPOSER_CHECK',
  /**
   * Polling the P2P module for txs to include in a block. Will move to CREATING_BLOCK if there are valid txs to include, or back to SYNCHRONIZING otherwise.
   */
  WAITING_FOR_TXS = 'WAITING_FOR_TXS',
  /**
   * Creating a new L2 block. Includes processing public function calls and running rollup circuits. Will move to PUBLISHING_CONTRACT_DATA.
   */
  CREATING_BLOCK = 'CREATING_BLOCK',
  /**
   * Publishing blocks to validator peers. Will move to WAITING_FOR_ATTESTATIONS.
   */
  PUBLISHING_BLOCK_TO_PEERS = 'PUBLISHING_BLOCK_TO_PEERS',
  /**
   * The block has been published to peers, and we are waiting for attestations. Will move to PUBLISHING_CONTRACT_DATA.
   */
  WAITING_FOR_ATTESTATIONS = 'WAITING_FOR_ATTESTATIONS',
  /**
   * Sending the tx to L1 with the L2 block data and awaiting it to be mined. Will move to SYNCHRONIZING.
   */
  PUBLISHING_BLOCK = 'PUBLISHING_BLOCK',
}

export type SequencerStateCallback = () => SequencerState;

export function sequencerStateToNumber(state: SequencerState): number {
  return Object.values(SequencerState).indexOf(state);
}

/** Order Attestations
 *
 * Returns attestation signatures in the order of a series of provided ethereum addresses
 * The rollup smart contract expects attestations to appear in the order of the committee
 *
 * @todo: perform this logic within the memory attestation store instead?
 */
export function orderAttestations(attestations: BlockAttestation[], orderAddresses: EthAddress[]): Signature[] {
  // Create a map of sender addresses to BlockAttestations
  const attestationMap = new Map<string, BlockAttestation>();

  for (const attestation of attestations) {
    const sender = attestation.getSender();
    if (sender) {
      attestationMap.set(sender.toString(), attestation);
    }
  }

  // Create the ordered array based on the orderAddresses, else return an empty signature
  const orderedAttestations = orderAddresses.map(address => {
    const addressString = address.toString();
    return attestationMap.get(addressString)?.signature || Signature.empty();
  });

  return orderedAttestations;
}

export function getSecondsIntoSlot(l1GenesisTime: number, aztecSlotDuration: number, slotNumber: number): number {
  const slotStartTimestamp = l1GenesisTime + slotNumber * aztecSlotDuration;
  return Date.now() / 1000 - slotStartTimestamp;
}
