import { MessageLoadOracleInputs } from "@aztec/acir-simulator";
import { AztecNode } from "@aztec/aztec-node";
import { Fr } from "@aztec/circuits.js";


// TODO(Maddiaa): Better naming
/** 
 * Serves as a data manager and getter for the commitment trees in the acir execution contexts.
 */
export class CommitmentDataOracle {

    constructor(private node: AztecNode) {}

  /**
   * Retrieves the L1ToL2Message associated with a specific message key
   * Throws an error if the message key is not found
   *
   * @param msgKey - The key of the message to be retrieved
   * @returns A promise that resolves to the message data, a sibling path and the
   *          index of the message in the the l1ToL2MessagesTree
   */
  async getL1ToL2Message(msgKey: Fr): Promise<MessageLoadOracleInputs> {
    const messageAndIndex = await this.node.getL1ToL2MessageAndIndex(msgKey);
    const message = messageAndIndex.message.toFieldArray();
    const index = messageAndIndex.index;
    const siblingPath = await this.node.getL1ToL2MessagesTreePath(index);
    return {
      message,
      siblingPath: siblingPath.toFieldArray(),
      index,
    };
  }
}