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

  const initialAccounts = testAccounts ? await getInitialTestAccounts() : [];
  const sponsoredFPCAddress = sponsoredFPC ? await getSponsoredFPCAddress() : [];
  const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
  const { genesisBlockHash, genesisArchiveRoot, fundingNeeded } = await getGenesisValues(initialFundedAccounts);

  const { rollup, slashFactoryAddress } = await deployNewRollupContracts(
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
    fundingNeeded,
    config,
    debugLogger,
  );

  if (json) {
    log(
      JSON.stringify(
        {
          rollupAddress: rollup.address,
          initialFundedAccounts: initialFundedAccounts.map(a => a.toString()),
          initialValidators: initialValidators.map(a => a.toString()),
          genesisBlockHash: genesisBlockHash.toString(),
          genesisArchiveRoot: genesisArchiveRoot.toString(),
          slashFactoryAddress: slashFactoryAddress.toString(),
        },
        null,
        2,
      ),
    );
  } else {
    log(`Rollup Address: ${rollup.address}`);
    log(`Initial funded accounts: ${initialFundedAccounts.map(a => a.toString()).join(', ')}`);
    log(`Initial validators: ${initialValidators.map(a => a.toString()).join(', ')}`);
    log(`Genesis block hash: ${genesisBlockHash.toString()}`);
    log(`Genesis archive root: ${genesisArchiveRoot.toString()}`);
    log(`Slash Factory Address: ${slashFactoryAddress.toString()}`);
  }
}
