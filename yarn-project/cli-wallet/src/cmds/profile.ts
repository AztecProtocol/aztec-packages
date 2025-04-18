import { type AccountWalletWithSecretKey, AuthWitness, type AztecAddress, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';
import type { TxProfileResult } from '@aztec/stdlib/tx';

import { promises as fs } from 'fs';
import path from 'path';
import { format } from 'util';

function printProfileResult(result: TxProfileResult, log: LogFn) {
  // TODO(AD): this is a bit misleading - the maximum gate count of any piece is as important
  // as the total gate count. We should probably print both.
  log(format('\nGate count per circuit:'));
  let acc = 0;
  result.executionSteps.forEach(r => {
    acc += r.gateCount!;
    log(
      format(
        '  ',
        r.functionName.padEnd(50),
        'Gates:',
        r.gateCount!.toLocaleString(),
        '\tSubtotal:',
        acc.toLocaleString(),
      ),
    );
  });
  log(format('\nTotal gates:', acc.toLocaleString()));
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

  const result = await call.profile({ profileMode, authWitnesses });
  printProfileResult(result, log);
  if (debugOutputPath) {
    const ivcInputsPath = path.join(debugOutputPath, 'ivc-inputs.msgpack');
    log(`Debug output written to ${ivcInputsPath}.`);
    await fs.writeFile(ivcInputsPath, serializePrivateExecutionSteps(result.executionSteps));
  }
}
