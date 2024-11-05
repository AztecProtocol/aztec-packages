import { type EthAddress } from '@aztec/foundation/eth-address';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { deployAztecContracts } from '../../utils/aztec.js';

export async function deployL1Contracts(
  rpcUrl: string,
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  salt: number | undefined,
  json: boolean,
  initialValidators: EthAddress[],
  log: LogFn,
  debugLogger: DebugLogger,
) {
  const { l1ContractAddresses } = await deployAztecContracts(
    rpcUrl,
    chainId,
    privateKey,
    mnemonic,
    salt,
    initialValidators,
    debugLogger,
  );

  if (json) {
    log(
      JSON.stringify(
        Object.fromEntries(Object.entries(l1ContractAddresses).map(([k, v]) => [k, v.toString()])),
        null,
        2,
      ),
    );
  } else {
    log(`Rollup Address: ${l1ContractAddresses.rollupAddress.toString()}`);
    log(`Registry Address: ${l1ContractAddresses.registryAddress.toString()}`);
    log(`L1 -> L2 Inbox Address: ${l1ContractAddresses.inboxAddress.toString()}`);
    log(`L2 -> L1 Outbox Address: ${l1ContractAddresses.outboxAddress.toString()}`);
    log(`Fee Juice Address: ${l1ContractAddresses.feeJuiceAddress.toString()}`);
    log(`Fee Juice Portal Address: ${l1ContractAddresses.feeJuicePortalAddress.toString()}`);
    log(`Nomismatokopio Address: ${l1ContractAddresses.nomismatokopioAddress.toString()}`);
    log(`Sysstia Address: ${l1ContractAddresses.sysstiaAddress.toString()}`);
    log(`Gerousia Address: ${l1ContractAddresses.gerousiaAddress.toString()}`);
    log(`Apella Address: ${l1ContractAddresses.apellaAddress.toString()}`);
  }
}
