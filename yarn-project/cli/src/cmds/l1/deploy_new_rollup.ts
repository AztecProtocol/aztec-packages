import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
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
  testAccounts: boolean,
  sponsoredFPC: boolean,
  json: boolean,
  initialValidators: Operator[],
  realVerifier: boolean,
  log: LogFn,
) {
  const config = getL1ContractsConfigEnvVars();

  const initialAccounts = testAccounts ? await getInitialTestAccountsData() : [];
  const sponsoredFPCAddress = sponsoredFPC ? await getSponsoredFPCAddress() : [];
  const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
  const { genesisArchiveRoot, fundingNeeded } = await getGenesisValues(initialFundedAccounts);

  const { rollup, slashFactoryAddress } = await deployNewRollupContracts(
    registryAddress,
    rpcUrls,
    privateKey,
    chainId,
    mnemonic,
    mnemonicIndex,
    initialValidators,
    genesisArchiveRoot,
    fundingNeeded,
    config,
    realVerifier,
  );

  if (json) {
    log(
      JSON.stringify(
        {
          rollupAddress: rollup.address,
          initialFundedAccounts: initialFundedAccounts.map(a => a.toString()),
          initialValidators: initialValidators.map(a => a.attester.toString()),
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
    log(`Initial validators: ${initialValidators.map(a => a.attester.toString()).join(', ')}`);
    log(`Genesis archive root: ${genesisArchiveRoot.toString()}`);
    log(`Slash Factory Address: ${slashFactoryAddress.toString()}`);
  }
}
