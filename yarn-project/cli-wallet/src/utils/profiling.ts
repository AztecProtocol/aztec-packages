import type { LogFn } from '@aztec/foundation/log';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';
import type { ProvingStats, ProvingTimings, SimulationStats, SimulationTimings } from '@aztec/stdlib/tx';

import { format } from 'util';

const FN_NAME_PADDING = 60;
const COLUMN_MIN_WIDTH = 13;
const COLUMN_MAX_WIDTH = 15;

const ORACLE_NAME_PADDING = 50;

export function printProfileResult(
  stats: ProvingStats | SimulationStats,
  log: LogFn,
  printOracles: boolean = false,
  executionSteps?: PrivateExecutionStep[],
) {
  log(format('\nPer circuit breakdown:\n'));
  log(
    format(
      '  ',
      'Function name'.padEnd(FN_NAME_PADDING),
      'Time'.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
      executionSteps ? 'Gates'.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH) : '',
      executionSteps ? 'Subtotal'.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH) : '',
    ),
  );
  log(
    format(
      ''.padEnd(
        FN_NAME_PADDING +
          COLUMN_MAX_WIDTH +
          COLUMN_MAX_WIDTH +
          (executionSteps ? COLUMN_MAX_WIDTH + COLUMN_MAX_WIDTH : 0),
        '-',
      ),
    ),
  );
  let acc = 0;
  let biggest: PrivateExecutionStep | undefined = executionSteps?.[0];

  const timings = stats.timings;
  timings.perFunction.forEach((fn, i) => {
    const currentExecutionStep = executionSteps?.[i];
    if (currentExecutionStep && biggest && currentExecutionStep.gateCount! > biggest.gateCount!) {
      biggest = currentExecutionStep;
    }
    acc += currentExecutionStep ? currentExecutionStep.gateCount! : 0;

    log(
      format(
        ' - ',
        fn.functionName.padEnd(FN_NAME_PADDING),
        `${fn.time.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
        currentExecutionStep
          ? currentExecutionStep.gateCount!.toLocaleString().padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH)
          : '',
        currentExecutionStep ? acc.toLocaleString().padStart(COLUMN_MAX_WIDTH) : '',
      ),
    );
    if (printOracles && fn.oracles) {
      log('');
      for (const [oracleName, { times }] of Object.entries(fn.oracles)) {
        const calls = times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        const total = times.reduce((acc, time) => acc + time, 0);
        const avg = total / calls;
        log(
          format(
            '    ',
            oracleName.padEnd(ORACLE_NAME_PADDING),
            `${calls} calls`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
            `${total.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
            `min: ${min.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
            `avg: ${avg.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
            `max: ${max.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
          ),
        );
      }
    }
    log('');
  });

  if (biggest) {
    log(
      format(
        '\nTotal gates:',
        acc.toLocaleString(),
        `(Biggest circuit: ${biggest.functionName} -> ${biggest.gateCount!.toLocaleString()})`,
      ),
    );
  }

  if (stats.nodeRPCCalls) {
    log(format('\nRPC calls:\n'));
    for (const [method, { times }] of Object.entries(stats.nodeRPCCalls)) {
      const calls = times.length;
      const total = times.reduce((acc, time) => acc + time, 0);
      const avg = total / calls;
      const min = Math.min(...times);
      const max = Math.max(...times);
      log(
        format(
          method.padEnd(ORACLE_NAME_PADDING),
          `${calls} calls`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
          `${total.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
          `min: ${min.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
          `avg: ${avg.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
          `max: ${max.toFixed(2)}ms`.padStart(COLUMN_MIN_WIDTH).padEnd(COLUMN_MAX_WIDTH),
        ),
      );
    }
  }

  log(format('\nSync time:'.padEnd(25), `${timings.sync?.toFixed(2)}ms`.padStart(16)));
  log(
    format(
      'Private simulation time:'.padEnd(25),
      `${timings.perFunction.reduce((acc, { time }) => acc + time, 0).toFixed(2)}ms`.padStart(COLUMN_MAX_WIDTH),
    ),
  );
  if ((timings as ProvingTimings).proving) {
    log(
      format(
        'Proving time:'.padEnd(25),
        `${(timings as ProvingTimings).proving?.toFixed(2)}ms`.padStart(COLUMN_MAX_WIDTH),
      ),
    );
  }
  if ((timings as SimulationTimings).publicSimulation) {
    log(
      format(
        'Public simulation time:'.padEnd(25),
        `${(timings as SimulationTimings).publicSimulation?.toFixed(2)}ms`.padStart(COLUMN_MAX_WIDTH),
      ),
    );
  }

  if ((timings as SimulationTimings).validation) {
    log(
      format(
        'Validation time:'.padEnd(25),
        `${(timings as SimulationTimings).validation?.toFixed(2)}ms`.padStart(COLUMN_MAX_WIDTH),
      ),
    );
  }

  log(
    format(
      'Total time:'.padEnd(25),
      `${timings.total.toFixed(2)}ms`.padStart(COLUMN_MAX_WIDTH),
      `(${timings.unaccounted.toFixed(2)}ms unaccounted)`,
    ),
  );
  log('\n');
}
