/**Checkpoint Proposal Recieved Callback Not Registered Error
 *
 * Error triggered if the allNodesCheckpointReceivedCallback is not registered
 * @category Errors
 */
export class CheckpointProposalRecievedCallbackNotRegisteredError extends Error {
  constructor() {
    super('FATAL (allNodesCheckpointReceivedCallback): All nodes should register a checkpoint proposal handler');
  }
}
