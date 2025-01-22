import { type LogFn } from '@aztec/foundation/log';

import { getExampleContractNames } from '../../utils/aztec.js';

export async function exampleContracts(log: LogFn) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  return (await getExampleContractNames())
    .filter(name => name !== 'AvmTest')
    .sort()
    .forEach(name => log(name));
}
