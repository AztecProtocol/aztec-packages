import { getInitialTestAccounts } from '@aztec/accounts/testing';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { getGenesisValues } from '@aztec/world-state/testing';

import { deployNewRollupContracts } from '../../utils/aztec.js';
import { getSponsoredFPCAddress } from '../../utils/setup_contracts.js';

export async function deployNewRollup(
  registryAddress: EthAddress,
  rpcUrls: string[],
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  mnemonicIndex: number,
  salt: number | undefined,
  testAccounts: boolean,
  sponsoredFPC: boolean,
  json: boolean,
  initialValidators: EthAddress[],
  log: LogFn,
  debugLogger: Logger,
) {
  const config = getL1ContractsConfigEnvVars();

  const initialFundedAccounts = testAccounts ? await getInitialTestAccounts() : [];
  const sponsoredFPCAddress = sponsoredFPC ? await getSponsoredFPCAddress() : [];
  const { genesisBlockHash, genesisArchiveRoot } = await getGenesisValues(
    initialFundedAccounts.map(a => a.address).concat(sponsoredFPCAddress),
  );

  log(`Deploying new rollup contracts to chain ${chainId}...`);
  log(`Initial funded accounts: ${initialFundedAccounts.map(a => a.address.toString()).join(', ')}`);
  log(`Initial validators: ${initialValidators.map(a => a.toString()).join(', ')}`);

  const { payloadAddress, rollup } = await deployNewRollupContracts(
    registryAddress,
    rpcUrls,
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
