import type { LogFn } from '@aztec/foundation/log';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';
import type { ProvingTimings, SimulationTimings } from '@aztec/stdlib/tx';

import { format } from 'util';

export function printProfileResult(
  timings: ProvingTimings | SimulationTimings,
  log: LogFn,
  executionSteps?: PrivateExecutionStep[],
) {
  log(format('\nPer circuit breakdown:\n'));
  log(
    format(
      '  ',
      'Function name'.padEnd(50),
      'Time'.padStart(13).padEnd(15),
      executionSteps ? 'Gates'.padStart(13).padEnd(15) : '',
      executionSteps ? 'Subtotal'.padStart(13).padEnd(15) : '',
    ),
  );
  log(format(''.padEnd(50 + 15 + 15 + (executionSteps ? 15 + 15 : 0), '-')));
  let acc = 0;
  let biggest: PrivateExecutionStep | undefined = executionSteps?.[0];

  timings.perFunction.forEach((fn, i) => {
    const currentExecutionStep = executionSteps?.[i];
    if (currentExecutionStep?.gateCount! > biggest?.gateCount!) {
      biggest = currentExecutionStep;
    }
    acc += currentExecutionStep?.gateCount!;

    log(
      format(
        '  ',
        fn.functionName.padEnd(50),
        `${fn.time.toFixed(2)}ms`.padStart(13).padEnd(15),
        currentExecutionStep ? currentExecutionStep.gateCount!.toLocaleString().padStart(13).padEnd(15) : '',
        currentExecutionStep ? acc.toLocaleString().padStart(15) : '',
      ),
    );
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

  log(format('\nSync time:'.padEnd(25), `${timings.sync?.toFixed(2)}ms`.padStart(16)));
  log(
    format(
      'Total simulation time:'.padEnd(25),
      `${timings.perFunction.reduce((acc, { time }) => acc + time, 0).toFixed(2)}ms`.padStart(15),
    ),
  );
  if ((timings as ProvingTimings).proving) {
    log(format('Proving time:'.padEnd(25), `${(timings as ProvingTimings).proving?.toFixed(2)}ms`.padStart(15)));
  }

  log(
    format(
      'Total time:'.padEnd(25),
      `${timings.total.toFixed(2)}ms`.padStart(15),
      `(${timings.unaccounted.toFixed(2)}ms unaccounted)`,
    ),
  );
  log('\n');
}
