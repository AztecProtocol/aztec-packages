import { Fr } from '@aztec/aztec.js/fields';
import { type EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import { type EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EpochMonitor } from '@aztec/prover-node';
import type { EthAddress, L2BlockSource } from '@aztec/stdlib/block';
import { computeL2ToL1MembershipWitnessFromMessagesInEpoch } from '@aztec/stdlib/messaging';

export class EpochTestSettler {
  private rollupCheatCodes: RollupCheatCodes;
  private epochMonitor?: EpochMonitor;

  constructor(
    cheatcodes: EthCheatCodes,
    rollupAddress: EthAddress,
    private l2BlockSource: L2BlockSource,
    private options: { pollingIntervalMs: number; provingDelayMs?: number },
  ) {
    this.rollupCheatCodes = new RollupCheatCodes(cheatcodes, { rollupAddress });
  }

  async start() {
    const { epochDuration } = await this.rollupCheatCodes.getConfig();
    this.epochMonitor = new EpochMonitor(this.l2BlockSource, { epochDuration: Number(epochDuration) }, this.options);
    this.epochMonitor.start(this);
  }

  async stop() {
    await this.epochMonitor?.stop();
  }

  async handleEpochReadyToProve(epoch: EpochNumber): Promise<boolean> {
    const blocks = await this.l2BlockSource.getBlocksForEpoch(epoch);
    const messagesInEpoch: Fr[][][][] = [];
    let previousSlotNumber = SlotNumber.ZERO;
    let checkpointIndex = -1;
    for (const block of blocks) {
      const slotNumber = block.header.globalVariables.slotNumber;
      if (slotNumber !== previousSlotNumber) {
        checkpointIndex++;
        messagesInEpoch[checkpointIndex] = [];
        previousSlotNumber = slotNumber;
      }
      messagesInEpoch[checkpointIndex].push(block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs));
    }

    const [firstMessage] = messagesInEpoch.flat(3);
    if (firstMessage) {
      const { root: outHash } = computeL2ToL1MembershipWitnessFromMessagesInEpoch(messagesInEpoch, firstMessage);
      await this.rollupCheatCodes.insertOutbox(epoch, outHash.toBigInt());
    }

    // Mark the blocks as proven.
    for (const block of blocks) {
      await this.rollupCheatCodes.markAsProven(block.number);
    }

    return true;
  }
}
