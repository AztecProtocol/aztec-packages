import { type AccountWalletWithSecretKey, AuthWitness, type AztecAddress, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { type PrivateExecutionStep, serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';
import type { TxProfileResult } from '@aztec/stdlib/tx';

import { promises as fs } from 'fs';
import path from 'path';
import { format } from 'util';

import type { IFeeOpts } from '../utils/options/fees.js';

function printProfileResult(result: TxProfileResult, log: LogFn) {
  log(format('\nPer circuit breakdown:\n'));
  log(
    format(
      '  ',
      'Function name'.padEnd(50),
      'Time'.padStart(13).padEnd(15),
      'Gates'.padStart(13).padEnd(15),
      'Subtotal'.padStart(13).padEnd(15),
    ),
  );
  log(format(''.padEnd(50 + 15 + 15 + 15 + 15, '-')));
  let acc = 0;
  let biggest: PrivateExecutionStep = result.executionSteps[0] ?? 0;

  result.executionSteps.forEach(r => {
    if (r.gateCount! > biggest.gateCount!) {
      biggest = r;
    }
    acc += r.gateCount!;
    log(
      format(
        '  ',
        r.functionName.padEnd(50),
        `${r.timings.witgen.toFixed(2)}ms`.padStart(13).padEnd(15),
        r.gateCount!.toLocaleString().padStart(13).padEnd(15),
        acc.toLocaleString().padStart(15),
      ),
    );
  });
  log(
    format(
      '\nTotal gates:',
      acc.toLocaleString(),
      `(Biggest circuit: ${biggest.functionName} -> ${biggest.gateCount!.toLocaleString()})`,
    ),
  );

  log(format('\nSync time:'.padEnd(25), `${result.timings.sync?.toFixed(2)}ms`.padStart(16)));
  log(
    format(
      'Total simulation time:'.padEnd(25),
      `${result.timings.perFunction.reduce((acc, { time }) => acc + time, 0).toFixed(2)}ms`.padStart(15),
    ),
  );
  log(format('Proving time:'.padEnd(25), `${result.timings.proving?.toFixed(2)}ms`.padStart(15)));
  log(
    format(
      'Total time:'.padEnd(25),
      `${result.timings.total.toFixed(2)}ms`.padStart(15),
      `(${result.timings.unaccounted.toFixed(2)}ms unaccounted)`,
    ),
  );
  log('\n');
}

export async function profile(
  wallet: AccountWalletWithSecretKey,
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  debugOutputPath: string | undefined,
  feeOpts: IFeeOpts,
  authWitnesses: AuthWitness[],
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);

  const result = await call.profile({
    ...(await feeOpts.toSendOpts(wallet)),
    profileMode: 'full',
    authWitnesses,
    skipProofGeneration: false,
  });
  printProfileResult(result, log);
  if (debugOutputPath) {
    const ivcInputsPath = path.join(debugOutputPath, 'ivc-inputs.msgpack');
    log(`Debug output written to ${ivcInputsPath}.`);
    await fs.writeFile(ivcInputsPath, serializePrivateExecutionSteps(result.executionSteps));
  }
}
