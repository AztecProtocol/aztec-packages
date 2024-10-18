import { type EthAddress } from '@aztec/circuits.js';
import { type LogFn } from '@aztec/foundation/log';

import { EthCheatCodes } from '@aztec/aztec.js';

export async function cheatCodeSetL1Balance(
  who: EthAddress,
  l1RpcUrl: string,
  amount: bigint,
  log: LogFn,
) {
  const cheatCodes = new EthCheatCodes(l1RpcUrl);
  await cheatCodes.setBalance(who, amount);

  log(`L1 balance of ${who} has been set to ${amount}`);
}
