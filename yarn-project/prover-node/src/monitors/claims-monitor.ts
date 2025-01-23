import { type EpochProofClaim } from '@aztec/circuit-types';
import { type EthAddress } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { type L1Publisher } from '@aztec/sequencer-client';
import {
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

export interface ClaimsMonitorHandler {
  handleClaim(proofClaim: EpochProofClaim): Promise<void>;
}

export class ClaimsMonitor implements Traceable {
  private runningPromise: RunningPromise;
  private log = createLogger('prover-node:claims-monitor');

  private handler: ClaimsMonitorHandler | undefined;
  private lastClaimEpochNumber: bigint | undefined;

  public readonly tracer: Tracer;

  constructor(
    private readonly l1Publisher: L1Publisher,
    private options: { pollingIntervalMs: number },
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    this.tracer = telemetry.getTracer('ClaimsMonitor');
    this.runningPromise = new RunningPromise(this.work.bind(this), this.log, this.options.pollingIntervalMs);
  }

  public start(handler: ClaimsMonitorHandler) {
    this.handler = handler;
    this.runningPromise.start();
    this.log.info(`Started ClaimsMonitor with prover address ${this.getProverAddress().toString()}`, this.options);
  }

  public async stop() {
    this.log.verbose('Stopping ClaimsMonitor');
    await this.runningPromise.stop();
    this.log.info('Stopped ClaimsMonitor');
  }

  @trackSpan('ClaimsMonitor.work')
  public async work() {
    const proofClaim = await this.l1Publisher.getProofClaim();
    if (!proofClaim) {
      this.log.trace(`Found no proof claim`);
      return;
    }

    if (this.lastClaimEpochNumber === undefined || proofClaim.epochToProve > this.lastClaimEpochNumber) {
      this.log.verbose(`Found new claim for epoch ${proofClaim.epochToProve} by ${proofClaim.bondProvider.toString()}`);
      if (proofClaim.bondProvider.equals(this.getProverAddress())) {
        await this.handler?.handleClaim(proofClaim);
      }
      this.lastClaimEpochNumber = proofClaim.epochToProve;
    }
  }

  protected getProverAddress(): EthAddress {
    return this.l1Publisher.getSenderAddress();
  }
}
