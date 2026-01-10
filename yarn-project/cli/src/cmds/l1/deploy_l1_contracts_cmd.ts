import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { type Operator, deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { bufferFrom } from '@aztec/foundation/buffer';
import { SecretValue } from '@aztec/foundation/config';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

import { mnemonicToAccount } from 'viem/accounts';

import { addLeadingHex } from '../../utils/aztec.js';
import { getSponsoredFPCAddress } from '../../utils/setup_contracts.js';

export async function deployL1ContractsCmd(
  rpcUrls: string[],
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  mnemonicIndex: number,
  testAccounts: boolean,
  sponsoredFPC: boolean,
  json: boolean,
  initialValidators: EthAddress[],
  realVerifier: boolean,
  existingToken: EthAddress | undefined,
  log: LogFn,
  debugLogger: Logger,
) {
  const config = getL1ContractsConfigEnvVars();

  // Compute initial accounts for genesis (test accounts + sponsored FPC)
  const initialAccounts = testAccounts ? await getInitialTestAccountsData() : [];
  const sponsoredFPCAddress = sponsoredFPC ? await getSponsoredFPCAddress() : [];
  const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
  const { genesisArchiveRoot, fundingNeeded } = await getGenesisValues(initialFundedAccounts);

  // Get the VK tree root
  const { getVKTreeRoot } = await import('@aztec/noir-protocol-circuits-types/vk-tree');
  const vkTreeRoot = getVKTreeRoot();

  // Get private key (from direct input or mnemonic)
  let deployerPrivateKey: `0x${string}`;
  if (privateKey) {
    deployerPrivateKey = addLeadingHex(privateKey);
  } else {
    const account = mnemonicToAccount(mnemonic!, { addressIndex: mnemonicIndex });
    deployerPrivateKey = `0x${bufferFrom(account.getHdKey().privateKey!).toString('hex')}`;
  }

  // Prepare validator operators with bn254 keys
  const initialValidatorOperators: Operator[] = initialValidators.map(a => ({
    attester: a,
    withdrawer: a,
    bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
  }));

  debugLogger.info('Deploying L1 contracts via Forge...');

  // Deploy using l1-contracts Forge scripts
  const { l1ContractAddresses, rollupVersion } = await deployAztecL1Contracts(rpcUrls[0], deployerPrivateKey, chainId, {
    // Initial validators to add during deployment
    initialValidators: initialValidatorOperators,
    // Genesis config
    vkTreeRoot,
    protocolContractsHash,
    genesisArchiveRoot,
    // Deployment options
    realVerifier,
    ...config,
    feeJuicePortalInitialBalance: fundingNeeded,
    existingTokenAddress: existingToken,
  });

  debugLogger.info('Forge deployment complete', { rollupVersion });

  if (json) {
    log(
      JSON.stringify(
        Object.fromEntries(Object.entries(l1ContractAddresses).map(([k, v]) => [k, v?.toString() ?? 'Not deployed'])),
        null,
        2,
      ),
    );
  } else {
    log(`Rollup Address: ${l1ContractAddresses.rollupAddress.toString()}`);
    log(`Registry Address: ${l1ContractAddresses.registryAddress.toString()}`);
    log(`GSE Address: ${l1ContractAddresses.gseAddress?.toString()}`);
    log(`L1 -> L2 Inbox Address: ${l1ContractAddresses.inboxAddress.toString()}`);
    log(`L2 -> L1 Outbox Address: ${l1ContractAddresses.outboxAddress.toString()}`);
    log(`Fee Juice Address: ${l1ContractAddresses.feeJuiceAddress.toString()}`);
    log(`Staking Asset Address: ${l1ContractAddresses.stakingAssetAddress.toString()}`);
    log(`Fee Juice Portal Address: ${l1ContractAddresses.feeJuicePortalAddress.toString()}`);
    log(`CoinIssuer Address: ${l1ContractAddresses.coinIssuerAddress.toString()}`);
    log(`RewardDistributor Address: ${l1ContractAddresses.rewardDistributorAddress.toString()}`);
    log(`GovernanceProposer Address: ${l1ContractAddresses.governanceProposerAddress.toString()}`);
    log(`Governance Address: ${l1ContractAddresses.governanceAddress.toString()}`);
    log(`SlashFactory Address: ${l1ContractAddresses.slashFactoryAddress?.toString()}`);
    log(`FeeAssetHandler Address: ${l1ContractAddresses.feeAssetHandlerAddress?.toString()}`);
    log(`StakingAssetHandler Address: ${l1ContractAddresses.stakingAssetHandlerAddress?.toString()}`);
    log(`ZK Passport Verifier Address: ${l1ContractAddresses.zkPassportVerifierAddress?.toString()}`);
    log(`Initial funded accounts: ${initialFundedAccounts.map(a => a.toString()).join(', ')}`);
    log(`Initial validators: ${initialValidators.map(a => a.toString()).join(', ')}`);
    log(`Genesis archive root: ${genesisArchiveRoot.toString()}`);
  }
}
