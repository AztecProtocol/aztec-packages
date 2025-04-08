import { type AccountWalletWithSecretKey, AuthWitness, type AztecAddress, Contract } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { serializeWitness } from '@aztec/noir-noirc_abi';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';
import type { TxProfileResult } from '@aztec/stdlib/tx';

import { encode } from '@msgpack/msgpack';
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

// TODO(#7371): This is duplicated.
// Longer term we won't use this hacked together msgpack format
// Leaving duplicated as this eventually bb will provide a serialization
// helper for passing to a generic msgpack RPC endpoint.
async function _createClientIvcProofFiles(directory: string, executionSteps: PrivateExecutionStep[]) {
  const acirPath = path.join(directory, 'acir.msgpack');
  const witnessPath = path.join(directory, 'witnesses.msgpack');
  const vkPath = path.join(directory, 'vks.msgpack');
  await fs.writeFile(acirPath, encode(executionSteps.map(map => map.bytecode)));
  await fs.writeFile(witnessPath, encode(executionSteps.map(map => serializeWitness(map.witness))));
  return {
    acirPath,
    witnessPath,
  };
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
    log(`Debug output written to ${debugOutputPath} (witnesses.msgpack and acir.msgpack)`);
    await _createClientIvcProofFiles(debugOutputPath, result.executionSteps);
  }
}
