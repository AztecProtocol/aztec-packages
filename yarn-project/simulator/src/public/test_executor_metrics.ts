import { sum } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { RevertCode } from '@aztec/stdlib/avm';

import { strict as assert } from 'assert';

import type { ExecutorMetricsInterface } from './executor_metrics_interface.js';

export interface PublicEnqueuedCallMetrics {
  fnName: string;
  durationMs: number;
  manaUsed: number;
  totalInstructionsExecuted: number;
  reverted: boolean;
}

export interface PublicTxMetrics {
  totalDurationMs: number;
  manaUsed: number;
  totalInstructionsExecuted: number;
  txHashMs: number | undefined;
  nonRevertiblePrivateInsertionsUs: number | undefined;
  revertiblePrivateInsertionsUs: number | undefined;
  enqueuedCalls: PublicEnqueuedCallMetrics[];
  revertedCode: RevertCode | undefined;
}

const NUM_SPACES = 4;
const H1 = '# ';
const H2 = '\n## ';
const INDENT = ' '.repeat(NUM_SPACES);
const INDENT0 = '- ';
const INDENT1 = INDENT + '- ';
const INDENT2 = INDENT + INDENT + '- ';
const H_LINE = '\n---------------------------------------------------------------------';

export enum PublicTxMetricsFilter {
  ALL,
  TOTALS,
  DURATIONS,
  INSTRUCTIONS,
}

export class TestExecutorMetrics implements ExecutorMetricsInterface {
  private logger: Logger;
  // tx label -> tx metrics
  private txMetrics: Map<string, PublicTxMetrics> = new Map();
  private currentTxLabel: string | undefined;
  private txTimer: Timer | undefined;

  constructor() {
    this.logger = createLogger(`simulator:test_executor_metrics`);
  }

  startRecordingTxSimulation(txLabel: string) {
    assert(!this.currentTxLabel, 'Cannot start recording tx simulation when another is live');
    assert(!this.txMetrics.has(txLabel), 'Cannot start recording metrics for tx with duplicate label');
    this.txMetrics.set(txLabel, {
      totalDurationMs: 0,
      manaUsed: 0,
      totalInstructionsExecuted: 0,
      txHashMs: undefined,
      nonRevertiblePrivateInsertionsUs: undefined,
      revertiblePrivateInsertionsUs: undefined,
      enqueuedCalls: [],
      revertedCode: undefined,
    });
    this.currentTxLabel = txLabel;
    this.txTimer = new Timer();
  }

  stopRecordingTxSimulation(txLabel: string, revertedCode?: RevertCode) {
    assert(this.currentTxLabel === txLabel, 'Cannot stop recording metrics for tx when another is live');

    const txMetrics = this.txMetrics.get(txLabel)!;

    // total duration of tx
    txMetrics.totalDurationMs = this.txTimer!.ms();
    this.logger.debug(`Public TX simulation of ${txLabel} took ${txMetrics.totalDurationMs}ms`);

    // add manaUsed across all enqueued calls
    txMetrics.manaUsed = sum(txMetrics.enqueuedCalls.map(call => call.manaUsed));
    // add totalInstructionsExecuted across all enqueued calls
    txMetrics.totalInstructionsExecuted = sum(txMetrics.enqueuedCalls.map(call => call.totalInstructionsExecuted));
    txMetrics.revertedCode = revertedCode;

    this.currentTxLabel = undefined;
  }

  recordEnqueuedCallSimulation(
    fnName: string,
    durationMs: number,
    manaUsed: number,
    totalInstructionsExecuted: number,
  ) {
    this.#recordEnqueuedCallSimulation(fnName, durationMs, manaUsed, totalInstructionsExecuted, false);
  }

  recordEnqueuedCallSimulationFailure(
    fnName: string,
    durationMs: number,
    manaUsed: number,
    totalInstructionsExecuted: number,
  ) {
    this.#recordEnqueuedCallSimulation(fnName, durationMs, manaUsed, totalInstructionsExecuted, true);
  }

  #recordEnqueuedCallSimulation(
    fnName: string,
    durationMs: number,
    manaUsed: number,
    totalInstructionsExecuted: number,
    reverted: boolean,
  ) {
    assert(this.currentTxLabel, 'Cannot record enqueued call simulation when no tx is live');
    const txMetrics = this.txMetrics.get(this.currentTxLabel)!;
    txMetrics.enqueuedCalls.push({
      fnName,
      durationMs,
      manaUsed,
      totalInstructionsExecuted: totalInstructionsExecuted,
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
    this.logger.info(this.toPrettyString(filter));
  }

  toPrettyString(filter: PublicTxMetricsFilter = PublicTxMetricsFilter.ALL) {
    let pretty = '';
    //pretty += H_LINE + '\n';
    pretty += `${H1}Public TX Simulation Metrics (${PublicTxMetricsFilter[filter]})\n`;
    for (const [txLabel, txMetrics] of this.txMetrics.entries()) {
      //pretty += H_LINE + '\n';
      pretty += `${H2}TX Label: ${txLabel}\n`;
      if (
        filter == PublicTxMetricsFilter.DURATIONS ||
        filter === PublicTxMetricsFilter.TOTALS ||
        filter === PublicTxMetricsFilter.ALL
      ) {
        pretty += `${INDENT0}Total duration: ${fmtNum(txMetrics.totalDurationMs, 'ms')}\n`;
      }
      if (filter === PublicTxMetricsFilter.TOTALS || filter === PublicTxMetricsFilter.ALL) {
        pretty += `${INDENT0}Total mana used: ${fmtNum(txMetrics.manaUsed)}\n`;
        const manaPerSecond = Math.round((txMetrics.manaUsed * 1000) / txMetrics.totalDurationMs);
        pretty += `${INDENT0}Mana per second: ${fmtNum(manaPerSecond)}\n`;
      }

      if (
        filter === PublicTxMetricsFilter.INSTRUCTIONS ||
        filter === PublicTxMetricsFilter.TOTALS ||
        filter === PublicTxMetricsFilter.ALL
      ) {
        pretty += `${INDENT0}Total instructions executed: ${fmtNum(txMetrics.totalInstructionsExecuted)}\n`;
      }
      if (filter === PublicTxMetricsFilter.DURATIONS || filter === PublicTxMetricsFilter.ALL) {
        pretty += `${INDENT0}Tx hash computation: ${fmtNum(txMetrics.txHashMs!, 'ms')}\n`;
        pretty += `${INDENT0}Private insertions:\n`;
        pretty += `${INDENT1}Non-revertible: ${fmtNum(txMetrics.nonRevertiblePrivateInsertionsUs! / 1_000, 'ms')}\n`;
        pretty += `${INDENT1}Revertible: ${fmtNum(txMetrics.revertiblePrivateInsertionsUs! / 1_000, 'ms')}\n`;
      }
      if (filter !== PublicTxMetricsFilter.TOTALS) {
        // totals exclude enqueued calls
        pretty += this.#enqueuedCallsToPrettyString(txMetrics, filter);
      }
      if (txMetrics.revertedCode !== undefined && !txMetrics.revertedCode.isOK()) {
        pretty += `${INDENT0}Reverted code: ${txMetrics.revertedCode?.getDescription()}\n`;
      }
      pretty += H_LINE + '\n';
    }
    return pretty;
  }

  #enqueuedCallsToPrettyString(txMetrics: PublicTxMetrics, filter: PublicTxMetricsFilter) {
    let pretty = '';
    pretty += `${INDENT0}Enqueued public calls:\n`;
    for (const enqueuedCall of txMetrics.enqueuedCalls) {
      pretty += `${INDENT1}**Fn: ${enqueuedCall.fnName}**\n`;
      if (filter === PublicTxMetricsFilter.DURATIONS || filter === PublicTxMetricsFilter.ALL) {
        pretty += `${INDENT2}Duration: ${fmtNum(enqueuedCall.durationMs, 'ms')}\n`;
      }
      if (filter === PublicTxMetricsFilter.ALL) {
        pretty += `${INDENT2}Mana used: ${fmtNum(enqueuedCall.manaUsed)}\n`;
        const manaPerSecond = Math.round((enqueuedCall.manaUsed * 1000) / enqueuedCall.durationMs);
        pretty += `${INDENT2}Mana per second: ${fmtNum(manaPerSecond)}\n`;
      }

      if (filter === PublicTxMetricsFilter.INSTRUCTIONS || filter === PublicTxMetricsFilter.ALL) {
        pretty += `${INDENT2}Instructions executed: ${fmtNum(enqueuedCall.totalInstructionsExecuted)}\n`;
      }
      if (enqueuedCall.reverted) {
        pretty += `${INDENT2}Reverted!\n`;
      }
    }
    return pretty;
  }

  toJSON(indent = 2) {
    return JSON.stringify(Object.fromEntries(this.txMetrics.entries()), null, indent);
  }

  toGithubActionBenchmarkJSON(indent = 2) {
    const data = [];
    for (const [txLabel, txMetrics] of this.txMetrics.entries()) {
      data.push({
        name: `${txLabel}/totalInstructionsExecuted`,
        value: txMetrics.totalInstructionsExecuted,
        unit: '#instructions',
      });
      data.push({
        name: `${txLabel}/totalDurationMs`,
        value: txMetrics.totalDurationMs,
        unit: 'ms',
      });
      data.push({
        name: `${txLabel}/manaUsed`,
        value: txMetrics.manaUsed,
        unit: 'mana',
      });
      data.push({
        name: `${txLabel}/txHashMs`,
        value: txMetrics.txHashMs,
        unit: 'ms',
      });
      data.push({
        name: `${txLabel}/nonRevertiblePrivateInsertionsUs`,
        value: txMetrics.nonRevertiblePrivateInsertionsUs,
        unit: 'us',
      });
      data.push({
        name: `${txLabel}/revertiblePrivateInsertionsUs`,
        value: txMetrics.revertiblePrivateInsertionsUs,
        unit: 'us',
      });
    }
    return JSON.stringify(data, null, indent);
  }
}

function fmtNum(num: number, unit?: string) {
  return `\`${num.toLocaleString()}${unit ? ` ${unit}` : ''}\``;
}
