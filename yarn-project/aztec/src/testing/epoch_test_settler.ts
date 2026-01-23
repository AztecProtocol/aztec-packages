import { Fr } from '@aztec/aztec.js/fields';
import { type EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import { type EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
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
    private log: Logger,
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
    const checkpointedBlocks = await this.l2BlockSource.getCheckpointedBlocksForEpoch(epoch);
    const blocks = checkpointedBlocks.map(b => b.block);
    this.log.info(
      `Settling epoch ${epoch} with blocks ${blocks[0]?.header.getBlockNumber()} to ${blocks.at(-1)?.header.getBlockNumber()}`,
      { blocks: blocks.map(b => b.toBlockInfo()) },
    );
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
    } else {
      this.log.info(`No L2 to L1 messages in epoch ${epoch}`);
    }

    const lastCheckpoint = checkpointedBlocks.at(-1)?.checkpointNumber;
    if (lastCheckpoint !== undefined) {
      await this.rollupCheatCodes.markAsProven(lastCheckpoint);
    } else {
      this.log.warn(`No checkpoint found for epoch ${epoch}`);
    }

    return true;
  }
}
