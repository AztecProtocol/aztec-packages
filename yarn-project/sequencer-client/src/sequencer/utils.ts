import type { EthAddress } from '@aztec/foundation/eth-address';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import type { BlockAttestation } from '@aztec/stdlib/p2p';

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
   * Initializing the block proposal. Will move to CREATING_BLOCK if there are valid txs to include, or back to SYNCHRONIZING otherwise.
   */
  INITIALIZING_PROPOSAL = 'INITIALIZING_PROPOSAL',
  /**
   * Creating a new L2 block. Includes processing public function calls and running rollup circuits. Will move to PUBLISHING_CONTRACT_DATA.
   */
  CREATING_BLOCK = 'CREATING_BLOCK',
  /**
   * Collecting attestations from its peers. Will move to PUBLISHING_BLOCK.
   */
  COLLECTING_ATTESTATIONS = 'COLLECTING_ATTESTATIONS',
  /**
   * Sending the tx to L1 with the L2 block data and awaiting it to be mined. Will move to SYNCHRONIZING.
   */
  PUBLISHING_BLOCK = 'PUBLISHING_BLOCK',
}

export type SequencerStateWithSlot =
  | SequencerState.INITIALIZING_PROPOSAL
  | SequencerState.CREATING_BLOCK
  | SequencerState.COLLECTING_ATTESTATIONS
  | SequencerState.PUBLISHING_BLOCK;

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
export function orderAttestations(
  attestations: BlockAttestation[],
  orderAddresses: EthAddress[],
): CommitteeAttestation[] {
  // Create a map of sender addresses to BlockAttestations
  const attestationMap = new Map<string, CommitteeAttestation>();

  for (const attestation of attestations) {
    const sender = attestation.getSender();
    if (sender) {
      attestationMap.set(
        sender.toString(),
        CommitteeAttestation.fromAddressAndSignature(sender, attestation.signature),
      );
    }
  }

  // Create the ordered array based on the orderAddresses, else return an empty attestation
  const orderedAttestations = orderAddresses.map(address => {
    const addressString = address.toString();
    return attestationMap.get(addressString) || CommitteeAttestation.fromAddress(address);
  });

  return orderedAttestations;
}
