import { type Logger, createLogger } from '@aztec/foundation/log';
import type { RevertCode } from '@aztec/stdlib/avm';

import { strict as assert } from 'assert';

import type { ExecutorMetricsInterface } from './executor_metrics_interface.js';

export interface PublicEnqueuedCallMetrics {
  fnName: string;
  durationMs: number;
  manaUsed: number;
  totalInstructions: number;
  reverted: boolean;
}

export interface PublicTxMetrics {
  totalDurationMs: number;
  manaUsed: number;
  totalInstructions: number;
  txHashMs: number | undefined;
  nonRevertiblePrivateInsertionsUs: number | undefined;
  revertiblePrivateInsertionsUs: number | undefined;
  enqueuedCalls: PublicEnqueuedCallMetrics[];
  revertedCode: RevertCode | undefined;
}

const DECIMALS = 2;
const TAB_WIDTH = 4;
const TAB = ' '.repeat(TAB_WIDTH);

export enum PublicTxMetricsFilter {
  ALL,
  TOTALS,
  DURATIONS,
  INSTRUCTIONS,
}

export class TestExecutorMetrics implements ExecutorMetricsInterface {
  private log: Logger;
  // tx label -> tx metrics
  private txMetrics: Map<string, PublicTxMetrics> = new Map();
  private currentTxLabel: string | undefined;

  constructor() {
    this.log = createLogger(`simulator:test_executor_metrics`);
  }

  startRecordingTxSimulation(txLabel: string) {
    assert(!this.currentTxLabel, 'Cannot start recording tx simulation when another is live');
    assert(!this.txMetrics.has(txLabel), 'Cannot start recording metrics for tx with duplicate label');
    this.txMetrics.set(txLabel, {
      totalDurationMs: 0,
      manaUsed: 0,
      totalInstructions: 0,
      txHashMs: undefined,
      nonRevertiblePrivateInsertionsUs: undefined,
      revertiblePrivateInsertionsUs: undefined,
      enqueuedCalls: [],
      revertedCode: undefined,
    });
    this.currentTxLabel = txLabel;
  }

  stopRecordingTxSimulation(txLabel: string, durationMs: number, revertedCode?: RevertCode) {
    assert(this.currentTxLabel === txLabel, 'Cannot stop recording metrics for tx when another is live');
    const txMetrics = this.txMetrics.get(txLabel)!;

    // total duration of tx
    txMetrics.totalDurationMs = durationMs;
    // add manaUsed across all enqueued calls
    txMetrics.manaUsed = txMetrics.enqueuedCalls.reduce((acc, call) => acc + call.manaUsed, 0);
    // add totalInstructions across all enqueued calls
    txMetrics.totalInstructions = txMetrics.enqueuedCalls.reduce((acc, call) => acc + call.totalInstructions, 0);
    txMetrics.revertedCode = revertedCode;

    this.currentTxLabel = undefined;
  }

  recordEnqueuedCallSimulation(fnName: string, durationMs: number, manaUsed: number, totalInstructions: number) {
    this.#recordEnqueuedCallSimulation(fnName, durationMs, manaUsed, totalInstructions, false);
  }

  recordEnqueuedCallSimulationFailure(fnName: string, durationMs: number, manaUsed: number, totalInstructions: number) {
    this.#recordEnqueuedCallSimulation(fnName, durationMs, manaUsed, totalInstructions, true);
  }

  #recordEnqueuedCallSimulation(
    fnName: string,
    durationMs: number,
    manaUsed: number,
    totalInstructions: number,
    reverted: boolean,
  ) {
    assert(this.currentTxLabel, 'Cannot record enqueued call simulation when no tx is live');
    const txMetrics = this.txMetrics.get(this.currentTxLabel)!;
    txMetrics.enqueuedCalls.push({
      fnName,
      durationMs,
      manaUsed,
      totalInstructions,
      reverted,
    });
  }

  recordTxHashComputation(durationMs: number) {
    assert(this.currentTxLabel, 'Cannot record tx hash computation time when no tx is live');
    const txMetrics = this.txMetrics.get(this.currentTxLabel)!;
    assert(txMetrics.txHashMs === undefined, 'Cannot RE-record tx hash computation time');
    txMetrics.txHashMs = durationMs;
  }

  recordPrivateEffectsInsertion(durationUs: number, type: 'revertible' | 'non-revertible') {
    assert(this.currentTxLabel, 'Cannot record private effects insertion when no tx is live');
    const txMetrics = this.txMetrics.get(this.currentTxLabel)!;
    if (type === 'revertible') {
      assert(
        txMetrics.revertiblePrivateInsertionsUs === undefined,
        'Cannot RE-record revertible insertions of private effects',
      );
      txMetrics.revertiblePrivateInsertionsUs = durationUs;
    } else {
      assert(
        txMetrics.nonRevertiblePrivateInsertionsUs === undefined,
        'Cannot RE-record non-revertible insertions of private effects',
      );
      txMetrics.nonRevertiblePrivateInsertionsUs = durationUs;
    }
  }

  prettyPrint(filter: PublicTxMetricsFilter = PublicTxMetricsFilter.ALL) {
    const separator = '=====================================================================';
    this.log.info(separator);
    this.log.info(`Public TX Simulation Metrics (${PublicTxMetricsFilter[filter]})`);
    for (const [txLabel, txMetrics] of this.txMetrics.entries()) {
      this.log.info(separator);
      this.log.info(`Tx label: ${txLabel}`);
      if (
        filter == PublicTxMetricsFilter.DURATIONS ||
        filter === PublicTxMetricsFilter.TOTALS ||
        filter === PublicTxMetricsFilter.ALL
      ) {
        this.log.info(`${TAB}Total duration: ${txMetrics.totalDurationMs.toFixed(DECIMALS)} ms`);
      }
      if (filter === PublicTxMetricsFilter.TOTALS || filter === PublicTxMetricsFilter.ALL) {
        this.log.info(`${TAB}Total mana used: ${txMetrics.manaUsed}`);
        const manaPerSecond = Math.round((txMetrics.manaUsed * 1000) / txMetrics.totalDurationMs);
        this.log.info(`${TAB}Mana per second: ${manaPerSecond}`);
      }

      if (
        filter === PublicTxMetricsFilter.INSTRUCTIONS ||
        filter === PublicTxMetricsFilter.TOTALS ||
        filter === PublicTxMetricsFilter.ALL
      ) {
        this.log.info(`${TAB}Total instructions executed: ${txMetrics.totalInstructions}`);
      }
      if (filter === PublicTxMetricsFilter.DURATIONS || filter === PublicTxMetricsFilter.ALL) {
        this.log.info(`${TAB}Tx hash computation: ${txMetrics.txHashMs!.toFixed(DECIMALS)} ms`);
        this.log.info(`${TAB}Private insertions:`);
        this.log.info(
          `${TAB}${TAB}Non-revertible: ${(txMetrics.nonRevertiblePrivateInsertionsUs! / 1_000).toFixed(DECIMALS)} ms`,
        );
        this.log.info(
          `${TAB}${TAB}Revertible: ${(txMetrics.revertiblePrivateInsertionsUs! / 1_000).toFixed(DECIMALS)} ms`,
        );
      }
      if (filter !== PublicTxMetricsFilter.TOTALS) {
        // totals exclude enqueued calls
        this.#printEnqueuedCalls(txMetrics, filter);
      }
      if (txMetrics.revertedCode !== undefined && !txMetrics.revertedCode.isOK()) {
        this.log.info(`${TAB}Reverted code: ${txMetrics.revertedCode?.getDescription()}`);
      }
    }
    this.log.info(separator);
  }

  #printEnqueuedCalls(txMetrics: PublicTxMetrics, filter: PublicTxMetricsFilter) {
    this.log.info(`${TAB}Enqueued public calls:`);
    for (const enqueuedCall of txMetrics.enqueuedCalls) {
      this.log.info(`${TAB}${TAB}Fn: ${enqueuedCall.fnName}`);
      if (filter === PublicTxMetricsFilter.DURATIONS || filter === PublicTxMetricsFilter.ALL) {
        this.log.info(`${TAB}${TAB}${TAB}Duration: ${enqueuedCall.durationMs.toFixed(DECIMALS)} ms`);
      }
      if (filter === PublicTxMetricsFilter.ALL) {
        this.log.info(`${TAB}${TAB}${TAB}Mana used: ${enqueuedCall.manaUsed}`);
        const manaPerSecond = Math.round((enqueuedCall.manaUsed * 1000) / enqueuedCall.durationMs);
        this.log.info(`${TAB}${TAB}${TAB}Mana per second: ${manaPerSecond}`);
      }

      if (filter === PublicTxMetricsFilter.INSTRUCTIONS || filter === PublicTxMetricsFilter.ALL) {
        this.log.info(`${TAB}${TAB}${TAB}Instructions executed: ${enqueuedCall.totalInstructions}`);
      }
      if (enqueuedCall.reverted) {
        this.log.info(`${TAB}${TAB}${TAB}Reverted!`);
      }
    }
  }

  toJSON() {
    return Object.fromEntries(this.txMetrics.entries());
  }
}
