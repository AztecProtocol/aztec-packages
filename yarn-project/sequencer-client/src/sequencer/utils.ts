export enum SequencerState {
  /** Sequencer is stopped and not processing any txs from the pool. */
  STOPPED = 'STOPPED',
  /** Sequencer is being stopped. Will move to STOPPED shortly. */
  STOPPING = 'STOPPING',
  /** Sequencer is awaiting the next call to work(). */
  IDLE = 'IDLE',
  /** Synchronizing with the L2 chain. */
  SYNCHRONIZING = 'SYNCHRONIZING',
  /** Checking if we are the proposer for the current slot. */
  PROPOSER_CHECK = 'PROPOSER_CHECK',
  /** Initializing the block proposal. Will move to CREATING_BLOCK if there are valid txs to include, or back to SYNCHRONIZING otherwise. */
  INITIALIZING_PROPOSAL = 'INITIALIZING_PROPOSAL',
  /** Creating a new L2 block. Includes processing public function calls and running rollup circuits. Will move to PUBLISHING_CONTRACT_DATA. */
  CREATING_BLOCK = 'CREATING_BLOCK',
  /** Collecting attestations from its peers. Will move to PUBLISHING_BLOCK. */
  COLLECTING_ATTESTATIONS = 'COLLECTING_ATTESTATIONS',
  /** Sending the tx to L1 with the L2 block data and awaiting it to be mined. Will move to SYNCHRONIZING. */
  PUBLISHING_BLOCK = 'PUBLISHING_BLOCK',
}

export type SequencerStateWithSlot =
  | SequencerState.INITIALIZING_PROPOSAL
  | SequencerState.CREATING_BLOCK
  | SequencerState.COLLECTING_ATTESTATIONS
  | SequencerState.PUBLISHING_BLOCK
  | SequencerState.PROPOSER_CHECK;

export type SequencerStateCallback = () => SequencerState;

export function sequencerStateToNumber(state: SequencerState): number {
  return Object.values(SequencerState).indexOf(state);
}
