import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type LogFn, type Logger } from '@aztec/foundation/log';

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
  debugLogger: Logger,
) {
  const config = getL1ContractsConfigEnvVars();

  const { l1ContractAddresses } = await deployAztecContracts(
    rpcUrl,
    chainId,
    privateKey,
    mnemonic,
    salt,
    initialValidators,
    config,
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
    log(`Staking Asset Address: ${l1ContractAddresses.stakingAssetAddress.toString()}`);
    log(`Fee Juice Portal Address: ${l1ContractAddresses.feeJuicePortalAddress.toString()}`);
    log(`CoinIssuer Address: ${l1ContractAddresses.coinIssuerAddress.toString()}`);
    log(`RewardDistributor Address: ${l1ContractAddresses.rewardDistributorAddress.toString()}`);
    log(`GovernanceProposer Address: ${l1ContractAddresses.governanceProposerAddress.toString()}`);
    log(`Governance Address: ${l1ContractAddresses.governanceAddress.toString()}`);
    log(`SlashFactory Address: ${l1ContractAddresses.slashFactoryAddress.toString()}`);
  }
}
