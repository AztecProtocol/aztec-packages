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
  // TS simulation
  totalDurationMs: number;
  manaUsed: number;
  totalInstructionsExecuted: number;
  nonRevertiblePrivateInsertionsUs: number | undefined;
  revertiblePrivateInsertionsUs: number | undefined;
  enqueuedCalls: PublicEnqueuedCallMetrics[];
  revertedCode: RevertCode | undefined;
  // Proving
  proverSimulationStepMs: number | undefined;
  proverProvingStepMs: number | undefined;
  proverTraceGenerationStepMs: number | undefined;
  // Proving (detail)
  traceGenerationInteractionsMs: number | undefined;
  traceGenerationTracesMs: number | undefined;
  provingSumcheckMs: number | undefined;
  provingPcsMs: number | undefined;
  provingLogDerivativeInverseMs: number | undefined;
  provingLogDerivativeInverseCommitmentsMs: number | undefined;
  provingWireCommitmentsMs: number | undefined;
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
  PROVING,
}

function createEmptyTxMetrics(): PublicTxMetrics {
  return {
    // TS simulation
    totalDurationMs: 0,
    manaUsed: 0,
    totalInstructionsExecuted: 0,
    nonRevertiblePrivateInsertionsUs: undefined,
    revertiblePrivateInsertionsUs: undefined,
    enqueuedCalls: [],
    revertedCode: undefined,
    // Proving
    proverSimulationStepMs: undefined,
    proverProvingStepMs: undefined,
    proverTraceGenerationStepMs: undefined,
    // Proving (detail)
    traceGenerationInteractionsMs: undefined,
    traceGenerationTracesMs: undefined,
    provingSumcheckMs: undefined,
    provingPcsMs: undefined,
    provingLogDerivativeInverseMs: undefined,
    provingLogDerivativeInverseCommitmentsMs: undefined,
    provingWireCommitmentsMs: undefined,
  };
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
    this.txMetrics.set(txLabel, createEmptyTxMetrics());
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

  recordProverMetrics(txLabel: string, metrics: Partial<PublicTxMetrics>) {
    if (!this.txMetrics.has(txLabel)) {
      this.txMetrics.set(txLabel, createEmptyTxMetrics());
    }
    const txMetrics = this.txMetrics.get(txLabel)!;
    for (const [key, value] of Object.entries(metrics)) {
      if (key in txMetrics) {
        txMetrics[key as keyof PublicTxMetrics] = value as any;
      }
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
        pretty += `${INDENT0}Private insertions:\n`;
        pretty += `${INDENT1}Non-revertible: ${fmtNum(txMetrics.nonRevertiblePrivateInsertionsUs! / 1_000, 'ms')}\n`;
        pretty += `${INDENT1}Revertible: ${fmtNum(txMetrics.revertiblePrivateInsertionsUs! / 1_000, 'ms')}\n`;
      }
      if (filter === PublicTxMetricsFilter.PROVING || filter === PublicTxMetricsFilter.ALL) {
        let provingPretty = '';
        if (txMetrics.proverSimulationStepMs !== undefined) {
          provingPretty += `${INDENT1}Simulation (all): ${fmtNum(txMetrics.proverSimulationStepMs, 'ms')}\n`;
        }
        if (txMetrics.proverProvingStepMs !== undefined) {
          provingPretty += `${INDENT1}Proving (all): ${fmtNum(txMetrics.proverProvingStepMs, 'ms')}\n`;
        }
        if (txMetrics.proverTraceGenerationStepMs !== undefined) {
          provingPretty += `${INDENT1}Trace generation (all): ${fmtNum(txMetrics.proverTraceGenerationStepMs, 'ms')}\n`;
        }
        if (txMetrics.traceGenerationInteractionsMs !== undefined) {
          provingPretty += `${INDENT1}Trace generation interactions: ${fmtNum(txMetrics.traceGenerationInteractionsMs, 'ms')}\n`;
        }
        if (txMetrics.traceGenerationTracesMs !== undefined) {
          provingPretty += `${INDENT1}Trace generation traces: ${fmtNum(txMetrics.traceGenerationTracesMs, 'ms')}\n`;
        }
        if (txMetrics.provingSumcheckMs !== undefined) {
          provingPretty += `${INDENT1}Sumcheck: ${fmtNum(txMetrics.provingSumcheckMs, 'ms')}\n`;
        }
        if (txMetrics.provingPcsMs !== undefined) {
          provingPretty += `${INDENT1}PCS: ${fmtNum(txMetrics.provingPcsMs, 'ms')}\n`;
        }
        if (txMetrics.provingLogDerivativeInverseMs !== undefined) {
          provingPretty += `${INDENT1}Log derivative inverse: ${fmtNum(txMetrics.provingLogDerivativeInverseMs, 'ms')}\n`;
        }
        if (txMetrics.provingLogDerivativeInverseCommitmentsMs !== undefined) {
          provingPretty += `${INDENT1}Log derivative inverse commitments: ${fmtNum(txMetrics.provingLogDerivativeInverseCommitmentsMs, 'ms')}\n`;
        }
        if (txMetrics.provingWireCommitmentsMs !== undefined) {
          provingPretty += `${INDENT1}Wire commitments: ${fmtNum(txMetrics.provingWireCommitmentsMs, 'ms')}\n`;
        }
        if (provingPretty.length > 0) {
          pretty += `${INDENT0}Proving:\n${provingPretty}`;
        }
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
    const metricsInfo = {
      totalInstructionsExecuted: {
        name: 'totalInstructionsExecuted',
        unit: '#instructions',
        category: PublicTxMetricsFilter.INSTRUCTIONS,
      },
      totalDurationMs: {
        name: 'totalDurationMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.DURATIONS,
      },
      manaUsed: {
        name: 'manaUsed',
        unit: 'mana',
        category: PublicTxMetricsFilter.TOTALS,
      },
      nonRevertiblePrivateInsertionsUs: {
        name: 'nonRevertiblePrivateInsertionsUs',
        unit: 'us',
        category: PublicTxMetricsFilter.DURATIONS,
      },
      revertiblePrivateInsertionsUs: {
        name: 'revertiblePrivateInsertionsUs',
        unit: 'us',
        category: PublicTxMetricsFilter.DURATIONS,
      },
      proverSimulationStepMs: {
        name: 'proverSimulationStepMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      proverProvingStepMs: {
        name: 'proverProvingStepMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      proverTraceGenerationStepMs: {
        name: 'proverTraceGenerationStepMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      traceGenerationInteractionsMs: {
        name: 'traceGenerationInteractionsMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      traceGenerationTracesMs: {
        name: 'traceGenerationTracesMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      provingSumcheckMs: {
        name: 'provingSumcheckMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      provingPcsMs: {
        name: 'provingPcsMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      provingLogDerivativeInverseMs: {
        name: 'provingLogDerivativeInverseMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      provingLogDerivativeInverseCommitmentsMs: {
        name: 'provingLogDerivativeInverseCommitmentsMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
      provingWireCommitmentsMs: {
        name: 'provingWireCommitmentsMs',
        unit: 'ms',
        category: PublicTxMetricsFilter.PROVING,
      },
    };

    const data = [];
    for (const [txLabel, txMetrics] of this.txMetrics.entries()) {
      for (const [key, value] of Object.entries(txMetrics)) {
        if (value !== undefined && key in metricsInfo) {
          data.push({
            name: `${txLabel}/${metricsInfo[key as keyof typeof metricsInfo].name}`,
            value: value,
            unit: metricsInfo[key as keyof typeof metricsInfo].unit,
          });
        }
      }
    }
    return JSON.stringify(data, null, indent);
  }
}

function fmtNum(num: number, unit?: string) {
  return `\`${num.toLocaleString()}${unit ? ` ${unit}` : ''}\``;
}
