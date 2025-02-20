import { getInitialTestAccounts } from '@aztec/accounts/testing';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type LogFn, type Logger } from '@aztec/foundation/log';
import { getGenesisValues } from '@aztec/world-state/testing';

import { deployNewRollupContracts } from '../../utils/aztec.js';

export async function deployNewRollup(
  registryAddress: EthAddress,
  rpcUrl: string,
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  mnemonicIndex: number,
  salt: number | undefined,
  testAccounts: boolean,
  json: boolean,
  initialValidators: EthAddress[],
  log: LogFn,
  debugLogger: Logger,
) {
  const config = getL1ContractsConfigEnvVars();

  const initialFundedAccounts = testAccounts ? await getInitialTestAccounts() : [];
  const { genesisBlockHash, genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts.map(a => a.address));

  const { payloadAddress, rollup } = await deployNewRollupContracts(
    registryAddress,
    rpcUrl,
    chainId,
    privateKey,
    mnemonic,
    mnemonicIndex,
    salt,
    initialValidators,
    genesisArchiveRoot,
    genesisBlockHash,
    config,
    debugLogger,
  );

  if (json) {
    log(
      JSON.stringify(
        {
          payloadAddress: payloadAddress.toString(),
          rollupAddress: rollup.address,
        },
        null,
        2,
      ),
    );
  } else {
    log(`Payload Address: ${payloadAddress.toString()}`);
    log(`Rollup Address: ${rollup.address}`);
  }
}
