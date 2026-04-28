/** Checkpoint Proposal Received Callback Not Registered Error
 *
 * Error triggered if the allNodesCheckpointReceivedCallback is not registered
 * @category Errors
 */
export class CheckpointProposalReceivedCallbackNotRegisteredError extends Error {
  constructor() {
    super('FATAL (allNodesCheckpointReceivedCallback): All nodes should register a checkpoint proposal handler');
    this.name = 'CheckpointProposalReceivedCallbackNotRegisteredError';
  }
}
