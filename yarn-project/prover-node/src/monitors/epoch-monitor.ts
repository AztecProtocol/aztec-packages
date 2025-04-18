import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { type L1RollupConstants, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import {
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

export interface EpochMonitorHandler {
  handleEpochReadyToProve(epochNumber: bigint): Promise<boolean>;
}

/**
 * Fires an event when a new epoch ready to prove is detected.
 *
 * We define an epoch as ready to prove when:
 * - The epoch is complete
 * - Its blocks have not been reorg'd out due to a missing L2 proof
 * - Its first block is the immediate successor of the last proven block
 *
 * This class periodically hits the L2BlockSource.
 * On start it will trigger the event for the last epoch ready to prove.
 */
export class EpochMonitor implements Traceable {
  private runningPromise: RunningPromise;
  private log = createLogger('prover-node:epoch-monitor');
  public readonly tracer: Tracer;

  private handler: EpochMonitorHandler | undefined;
  private latestEpochNumber: bigint | undefined;

  constructor(
    private readonly l2BlockSource: L2BlockSource,
    private readonly l1Constants: Pick<L1RollupConstants, 'epochDuration'>,
    private options: { pollingIntervalMs: number },
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    this.tracer = telemetry.getTracer('EpochMonitor');
    this.runningPromise = new RunningPromise(this.work.bind(this), this.log, this.options.pollingIntervalMs);
  }

  public static async create(
    l2BlockSource: L2BlockSource,
    options: { pollingIntervalMs: number },
    telemetry: TelemetryClient = getTelemetryClient(),
  ): Promise<EpochMonitor> {
    const l1Constants = await l2BlockSource.getL1Constants();
    return new EpochMonitor(l2BlockSource, l1Constants, options, telemetry);
  }

  public start(handler: EpochMonitorHandler) {
    this.handler = handler;
    this.runningPromise.start();
    this.log.info('Started EpochMonitor', this.options);
  }

  /** Exposed for testing */
  public setHandler(handler: EpochMonitorHandler) {
    this.handler = handler;
  }

  public async stop() {
    await this.runningPromise.stop();
    this.log.info('Stopped EpochMonitor');
  }

  @trackSpan('EpochMonitor.work')
  public async work() {
    const { epochToProve, blockNumber, slotNumber } = await this.getEpochNumberToProve();
    this.log.debug(`Epoch to prove: ${epochToProve}`, { blockNumber, slotNumber });
    if (epochToProve === undefined) {
      this.log.trace(`Next block to prove ${blockNumber} not yet mined`, { blockNumber });
      return;
    }
    if (this.latestEpochNumber !== undefined && epochToProve <= this.latestEpochNumber) {
      this.log.trace(`Epoch ${epochToProve} already processed`, { epochToProve, blockNumber, slotNumber });
      return;
    }

    const isCompleted = await this.l2BlockSource.isEpochComplete(epochToProve);
    if (!isCompleted) {
      this.log.trace(`Epoch ${epochToProve} is not complete`, { epochToProve, blockNumber, slotNumber });
      return;
    }

    this.log.debug(`Epoch ${epochToProve} is ready to be proven`);
    if (await this.handler?.handleEpochReadyToProve(epochToProve)) {
      this.latestEpochNumber = epochToProve;
    }
  }

  private async getEpochNumberToProve() {
    const lastBlockProven = await this.l2BlockSource.getProvenBlockNumber();
    const firstBlockToProve = lastBlockProven + 1;
    const firstBlockHeaderToProve = await this.l2BlockSource.getBlockHeader(firstBlockToProve);
    if (!firstBlockHeaderToProve) {
      return { epochToProve: undefined, blockNumber: firstBlockToProve };
    }

    const firstSlotOfEpochToProve = firstBlockHeaderToProve.getSlot();
    const epochToProve = getEpochAtSlot(firstSlotOfEpochToProve, this.l1Constants);
    return { epochToProve, blockNumber: firstBlockToProve, slotNumber: firstSlotOfEpochToProve };
  }
}
