import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import {
  L1Deployer,
  type Operator,
  addMultipleValidators,
  deploySlashFactory,
  getL1ContractsConfigEnvVars,
  setupL1ContractsViaForge,
} from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

import { defineChain, encodeFunctionData } from 'viem';

import { addLeadingHex } from '../../utils/aztec.js';
import { getSponsoredFPCAddress } from '../../utils/setup_contracts.js';

export async function deployL1Contracts(
  rpcUrls: string[],
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  mnemonicIndex: number,
  salt: number | undefined,
  testAccounts: boolean,
  sponsoredFPC: boolean,
  acceleratedTestDeployments: boolean,
  json: boolean,
  createVerificationJson: string | false,
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
    // Derive private key from mnemonic
    const { HDKey } = await import('@scure/bip32');
    const { mnemonicToSeedSync } = await import('@scure/bip39');
    const seed = mnemonicToSeedSync(mnemonic!);
    const hdKey = HDKey.fromMasterSeed(seed);
    const derivationPath = `m/44'/60'/0'/0/${mnemonicIndex}`;
    const childKey = hdKey.derive(derivationPath);
    if (!childKey.privateKey) {
      throw new Error('Failed to derive private key from mnemonic');
    }
    deployerPrivateKey = `0x${Buffer.from(childKey.privateKey).toString('hex')}`;
  }

  // Prepare validator operators with bn254 keys
  const initialValidatorOperators: Operator[] = initialValidators.map(a => ({
    attester: a,
    withdrawer: a,
    bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
  }));

  debugLogger.info('Deploying L1 contracts via Forge...');

  // Create a chain definition for the target chain
  const targetChain = defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrls[0]] } },
  });

  // Deploy using Forge - buildForgeEnvVars handles all dependent value calculations
  // (e.g., slashingRoundSize from slashingRoundSizeInEpochs, slashingQuorum from slashingRoundSize)
  const { l1ContractAddresses, l1Client, rollupVersion } = await setupL1ContractsViaForge(
    rpcUrls[0],
    deployerPrivateKey,
    {
      // Runtime options
      chain: targetChain,
      logger: debugLogger,

      // Genesis state
      vkTreeRoot: vkTreeRoot.toString(),
      protocolContractsHash: protocolContractsHash.toString(),
      genesisArchiveRoot: genesisArchiveRoot.toString(),

      // Deployment options
      realVerifier,

      // Core timing
      aztecSlotDuration: config.aztecSlotDuration,
      aztecEpochDuration: config.aztecEpochDuration,
      targetCommitteeSize: config.aztecTargetCommitteeSize,

      // Validator set
      lagInEpochsForValidatorSet: config.lagInEpochsForValidatorSet,
      lagInEpochsForRandao: config.lagInEpochsForRandao,
      aztecProofSubmissionEpochs: config.aztecProofSubmissionEpochs,

      // GSE
      activationThreshold: config.activationThreshold,
      ejectionThreshold: config.ejectionThreshold,

      // Slashing - slashingRoundSize and slashingQuorum are calculated by buildForgeEnvVars
      slasherFlavor: config.slasherFlavor as 'none' | 'tally' | 'empire',
      slashingRoundSizeInEpochs: config.slashingRoundSizeInEpochs,
      slashingOffsetInRounds: config.slashingOffsetInRounds,
      slashingLifetimeInRounds: config.slashingLifetimeInRounds,
      slashingExecutionDelayInRounds: config.slashingExecutionDelayInRounds,
      slashingDisableDuration: config.slashingDisableDuration,
      slashingVetoer: config.slashingVetoer.toString(),
      slashAmountSmall: config.slashAmountSmall,
      slashAmountMedium: config.slashAmountMedium,
      slashAmountLarge: config.slashAmountLarge,

      // Fee
      manaTarget: config.manaTarget,
      provingCostPerMana: config.provingCostPerMana,
      exitDelaySeconds: config.exitDelaySeconds,
      localEjectionThreshold: config.localEjectionThreshold,

      // Governance
      governanceProposerQuorum: config.governanceProposerQuorum,
      governanceProposerRoundSize: config.governanceProposerRoundSize,
    },
  );

  debugLogger.info('Forge deployment complete', { rollupVersion });

  // Create deployer for post-deploy operations
  const deployer = new L1Deployer(l1Client, salt, undefined, acceleratedTestDeployments, debugLogger);

  // Deploy SlashFactory (not deployed by Forge)
  const slashFactoryAddress = await deploySlashFactory(
    deployer,
    l1ContractAddresses.rollupAddress.toString(),
    debugLogger,
  );
  debugLogger.info(`Deployed SlashFactory at ${slashFactoryAddress}`);

  // Fund fee juice portal for test accounts (if needed)
  if (fundingNeeded > 0n && !existingToken) {
    const feeJuicePortalAddress = l1ContractAddresses.feeJuicePortalAddress;
    debugLogger.info(`Funding fee juice portal with ${fundingNeeded} wei...`);

    // Import the FeeAssetArtifact for the mint call
    const { FeeAssetArtifact } = await import('@aztec/ethereum');
    await deployer.sendTransaction({
      to: l1ContractAddresses.feeJuiceAddress.toString(),
      data: encodeFunctionData({
        abi: FeeAssetArtifact.contractAbi,
        functionName: 'mint',
        args: [feeJuicePortalAddress.toString(), fundingNeeded],
      }),
    });
    debugLogger.info(`Funded fee juice portal at ${feeJuicePortalAddress}`);
  }

  // Register initial validators (if provided)
  if (initialValidatorOperators.length > 0 && l1ContractAddresses.gseAddress) {
    debugLogger.info(`Registering ${initialValidatorOperators.length} initial validators...`);
    await addMultipleValidators(
      l1Client,
      deployer,
      l1ContractAddresses.gseAddress.toString() as `0x${string}`,
      l1ContractAddresses.rollupAddress.toString() as `0x${string}`,
      l1ContractAddresses.stakingAssetAddress.toString() as `0x${string}`,
      initialValidatorOperators,
      acceleratedTestDeployments,
      debugLogger,
    );
    debugLogger.info('Initial validators registered');
  }

  // Wait for all deployments to complete
  await deployer.waitForDeployments();

  // Build final addresses including SlashFactory
  const finalAddresses = {
    ...l1ContractAddresses,
    slashFactoryAddress,
  };

  if (json) {
    log(
      JSON.stringify(
        Object.fromEntries(Object.entries(finalAddresses).map(([k, v]) => [k, v?.toString() ?? 'Not deployed'])),
        null,
        2,
      ),
    );
  } else {
    log(`Rollup Address: ${finalAddresses.rollupAddress.toString()}`);
    log(`Registry Address: ${finalAddresses.registryAddress.toString()}`);
    log(`GSE Address: ${finalAddresses.gseAddress?.toString()}`);
    log(`L1 -> L2 Inbox Address: ${finalAddresses.inboxAddress.toString()}`);
    log(`L2 -> L1 Outbox Address: ${finalAddresses.outboxAddress.toString()}`);
    log(`Fee Juice Address: ${finalAddresses.feeJuiceAddress.toString()}`);
    log(`Staking Asset Address: ${finalAddresses.stakingAssetAddress.toString()}`);
    log(`Fee Juice Portal Address: ${finalAddresses.feeJuicePortalAddress.toString()}`);
    log(`CoinIssuer Address: ${finalAddresses.coinIssuerAddress.toString()}`);
    log(`RewardDistributor Address: ${finalAddresses.rewardDistributorAddress.toString()}`);
    log(`GovernanceProposer Address: ${finalAddresses.governanceProposerAddress.toString()}`);
    log(`Governance Address: ${finalAddresses.governanceAddress.toString()}`);
    log(`SlashFactory Address: ${finalAddresses.slashFactoryAddress?.toString()}`);
    log(`FeeAssetHandler Address: ${finalAddresses.feeAssetHandlerAddress?.toString()}`);
    log(`StakingAssetHandler Address: ${finalAddresses.stakingAssetHandlerAddress?.toString()}`);
    log(`ZK Passport Verifier Address: ${finalAddresses.zkPassportVerifierAddress?.toString()}`);
    log(`Initial funded accounts: ${initialFundedAccounts.map(a => a.toString()).join(', ')}`);
    log(`Initial validators: ${initialValidators.map(a => a.toString()).join(', ')}`);
    log(`Genesis archive root: ${genesisArchiveRoot.toString()}`);
  }
}
