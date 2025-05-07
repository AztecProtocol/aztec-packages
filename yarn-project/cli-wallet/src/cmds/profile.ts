import { type AccountWalletWithSecretKey, AuthWitness, type AztecAddress, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { type PrivateExecutionStep, serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';
import type { TxProfileResult } from '@aztec/stdlib/tx';

import { promises as fs } from 'fs';
import path from 'path';
import { format } from 'util';

function printProfileResult(result: TxProfileResult, log: LogFn) {
  log(format('\nSync time:', result.timings.sync, 'ms'));
  log(format('\nPer circuit breakdown:'));
  let acc = 0;
  let maxGateCount: PrivateExecutionStep = result.executionSteps[0];

  const gateCountComputationTime = result.executionSteps.reduce(
    (acc, { timings: { gateCount } }) => acc + (gateCount ?? 0),
    0,
  );

  result.executionSteps.forEach(r => {
    if (r.gateCount! > (maxGateCount.gateCount ?? 0)) {
      maxGateCount = r;
    }
    acc += r.gateCount!;
    log(
      format(
        '  ',
        r.functionName.padEnd(50),
        'Time:',
        `${r.timings.witgen.toFixed(2).padEnd(10)}ms`,
        'Gates:',
        r.gateCount!.toLocaleString(),
        '\tSubtotal:',
        acc.toLocaleString(),
      ),
    );
  });
  log(format('\nMaximum gate count:', maxGateCount?.toLocaleString()));
  log(format('\nTotal gates:', acc.toLocaleString()));

  log(
    format(
      '\nTotal simulation time:',
      result.timings.perFunction.reduce((acc, { time }) => acc + time, 0).toFixed(2),
      'ms',
    ),
  );
  log(format('\nProving time:', result.timings.proving?.toFixed(2), 'ms'));
  log(
    format(
      '\nTotal time:',
      result.timings.total.toFixed(2),
      'ms',
      '(',
      result.timings.unaccounted.toFixed(2),
      'ms) unaccounted',
    ),
  );
}

export async function profile(
  wallet: AccountWalletWithSecretKey,
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  debugOutputPath: string | undefined,
  authWitnesses: AuthWitness[],
  log: LogFn,
) {
  const profileMode = debugOutputPath ? ('full' as const) : ('gates' as const);
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);

  const result = await call.profile({ profileMode, authWitnesses, skipProofGeneration: false });
  printProfileResult(result, log);
  if (debugOutputPath) {
    const ivcInputsPath = path.join(debugOutputPath, 'ivc-inputs.msgpack');
    log(`Debug output written to ${ivcInputsPath}.`);
    await fs.writeFile(ivcInputsPath, serializePrivateExecutionSteps(result.executionSteps));
  }
}
