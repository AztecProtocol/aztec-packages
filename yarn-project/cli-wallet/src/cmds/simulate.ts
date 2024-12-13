import { type AccountWalletWithSecretKey, type AztecAddress, Contract, type ProfileResult } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import { type LogFn } from '@aztec/foundation/log';

import { format } from 'util';

function printProfileResult(result: ProfileResult, log: LogFn) {
  log(format('\nSimulation result:'));
  log(format('Return value:', JSON.stringify(result.returnValues, null, 2)));

  log(format('\nGate count per circuit:'));
  let acc = 0;
  result.gateCounts.forEach(r => {
    acc += r.gateCount;
    log(format('  ', r.circuitName.padEnd(50), 'Gates:', r.gateCount.toLocaleString(), '\tAcc:', acc.toLocaleString()));
  });

  log(format('\nTotal gates:', acc.toLocaleString()));
}

export async function simulate(
  wallet: AccountWalletWithSecretKey,
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  profile: boolean,
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);

  if (profile) {
    const result = await call.simulateWithProfile();
    printProfileResult(result, log);
  } else {
    const result = await call.simulate();
    log(format('\nSimulation result: ', result, '\n'));
  }
}
