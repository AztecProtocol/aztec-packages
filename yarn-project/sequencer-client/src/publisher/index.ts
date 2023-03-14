import { L2BlockData, L2BlockReceiver } from "../receiver.js";
import { EncodedL2BlockData, encodeL2BlockDataForPublish } from "./encode.js";

const MIN_FEE_DISTRIBUTOR_BALANCE = 5n * 10n ** 17n;

/**
 * Publishes L2 blocks to the L1 rollup contracts.
 * Adapted from https://github.com/AztecProtocol/aztec2-internal/blob/master/falafel/src/rollup_publisher.ts
 */
export class L2BlockPublisher implements L2BlockReceiver {
  private interrupted = false;
  private interruptPromise = Promise.resolve();
  private interruptResolve = () => {};

  constructor(
  ) {
    this.interruptPromise = new Promise(resolve => (this.interruptResolve = resolve));
  }
  
  public async processL2Block(l2BlockData: L2BlockData): Promise<boolean> {
    const txData = await this.createTxData(l2BlockData);

    while (!this.interrupted) {
      if (!await this.checkFeeDistributorBalance()) {
        console.log(`Fee distributor ETH balance too low, awaiting top up...`);
        await this.sleepOrInterrupted(60000);
        continue;
      }
      
      const txHash = await this.sendTransaction(txData);
      if (!txHash) break;

      const receipt = await this.getTransactionReceipt(txHash);
      if (!receipt) break;

      // Tx was mined successfully
      if (receipt.status) return true;
      
      // Check if someone else moved the block id
      if (!await this.checkNextL2BlockId(l2BlockData.id)) {
        console.log('Publish failed. Contract changed underfoot.');
        break;
      }

      console.log(`Transaction status failed: ${txHash}`);
      await this.sleepOrInterrupted(60000);
    }

    console.log('Publish rollup interrupted.');
    return false;
  }

  /**
   * Calling `interrupt` will cause any in progress call to `publishRollup` to return `false` asap.
   * Be warned, the call may return false even if the tx subsequently gets successfully mined.
   * In practice this shouldn't matter, as we'll only ever be calling `interrupt` when we know it's going to fail.
   * A call to `clearInterrupt` is required before you can continue publishing.
   */
  public interrupt() {
    this.interrupted = true;
    this.interruptResolve();
  }

  // TODO: Check fee distributor has at least 0.5 ETH
  private async checkFeeDistributorBalance(): Promise<boolean> {
    return true;
  }

  // TODO: Fail if blockchainStatus.nextRollupId > thisBlockId
  private async checkNextL2BlockId(thisBlockId: number): Promise<boolean> {
    return true;
  }
  
  // TODO: Swap for an actual implementation
  private async createTxData(l2BlockData: L2BlockData) {
    return encodeL2BlockDataForPublish(l2BlockData);
  }

  private async sendTransaction(encodedData: EncodedL2BlockData): Promise<string | undefined> {
    while (!this.interrupted) {
      try {
        // TODO: Send the tx
        return '';
      } catch (err) {
        console.log(`Error sending tx to L1`, err);
        await this.sleepOrInterrupted(60000);
      }
    }
  }

  private async getTransactionReceipt(txHash: string): Promise<{ status: boolean } | undefined> {
    while (!this.interrupted) {
      try {
        // TODO: Get the tx receipt
        return { status: true };
      } catch (err) {
        console.log(`Error getting tx receipt`, err);
        await this.sleepOrInterrupted(60000);
      }
    }
  }

  private async sleepOrInterrupted(ms: number) {
    await Promise.race([new Promise(resolve => setTimeout(resolve, ms)), this.interruptPromise]);
  }
}