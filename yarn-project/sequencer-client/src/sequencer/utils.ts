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
  /** Initializing the checkpoint proposal. */
  INITIALIZING_CHECKPOINT = 'INITIALIZING_CHECKPOINT',
  /** Waiting for transactions to arrive in the pool. */
  WAITING_FOR_TXS = 'WAITING_FOR_TXS',
  /** Creating a new L2 block. Includes processing public function calls. */
  CREATING_BLOCK = 'CREATING_BLOCK',
  /** Waiting until the next block can be created. */
  WAITING_UNTIL_NEXT_BLOCK = 'WAITING_UNTIL_NEXT_BLOCK',
  /** Assembling and broadcasting the checkpoint. */
  ASSEMBLING_CHECKPOINT = 'ASSEMBLING_CHECKPOINT',
  /** Collecting attestations from its peers. */
  COLLECTING_ATTESTATIONS = 'COLLECTING_ATTESTATIONS',
  /** Sending the tx to L1 with the L2 checkpoint data and awaiting it to be mined.. */
  PUBLISHING_CHECKPOINT = 'PUBLISHING_CHECKPOINT',
}

export type SequencerStateWithSlot =
  | SequencerState.INITIALIZING_CHECKPOINT
  | SequencerState.WAITING_FOR_TXS
  | SequencerState.CREATING_BLOCK
  | SequencerState.WAITING_UNTIL_NEXT_BLOCK
  | SequencerState.COLLECTING_ATTESTATIONS
  | SequencerState.PUBLISHING_CHECKPOINT
  | SequencerState.PROPOSER_CHECK
  | SequencerState.ASSEMBLING_CHECKPOINT;

export type SequencerStateCallback = () => SequencerState;

export function sequencerStateToNumber(state: SequencerState): number {
  return Object.values(SequencerState).indexOf(state);
}
