// TODO CLAUDE NUMBER 4
// Note the following TS function we want to port
// /**
//  * Deploys a new rollup contract, funds and initializes the fee juice portal, and initializes the validator set.
//  */
// export const deployRollup = async (
//   extendedClient: ExtendedViemWalletClient,
//   deployer: L1Deployer,
//   args: Omit<
//     DeployL1ContractsArgs,
//     'governanceProposerQuorum' | 'governanceProposerRoundSize' | 'ejectionThreshold' | 'activationThreshold'
//   >,
//   addresses: Pick<
//     L1ContractAddresses,
//     | 'feeJuiceAddress'
//     | 'registryAddress'
//     | 'rewardDistributorAddress'
//     | 'stakingAssetAddress'
//     | 'gseAddress'
//     | 'governanceAddress'
//   >,
//   logger: Logger,
// ) => {
//   if (!addresses.gseAddress) {
//     throw new Error('GSE address is required when deploying');
//   }
//   const networkName = getActiveNetworkName();

//   logger.info(`Deploying rollup using network configuration: ${networkName}`);

//   const txHashes: Hex[] = [];

//   let epochProofVerifier = EthAddress.ZERO;

//   if (args.realVerifier) {
//     epochProofVerifier = (await deployer.deploy(l1ArtifactsVerifiers.honkVerifier)).address;
//     logger.verbose(`Rollup will use the real verifier at ${epochProofVerifier}`);
//   } else {
//     epochProofVerifier = (await deployer.deploy(mockVerifiers.mockVerifier)).address;
//     logger.verbose(`Rollup will use the mock verifier at ${epochProofVerifier}`);
//   }

//   const rewardConfig = {
//     ...getRewardConfig(networkName),
//     rewardDistributor: addresses.rewardDistributorAddress.toString(),
//   };

//   const rollupConfigArgs: ContractConstructorArgs<typeof RollupAbi>[6] = {
//     aztecSlotDuration: BigInt(args.aztecSlotDuration),
//     aztecEpochDuration: BigInt(args.aztecEpochDuration),
//     targetCommitteeSize: BigInt(args.aztecTargetCommitteeSize),
//     lagInEpochsForValidatorSet: BigInt(args.lagInEpochsForValidatorSet),
//     lagInEpochsForRandao: BigInt(args.lagInEpochsForRandao),
//     aztecProofSubmissionEpochs: BigInt(args.aztecProofSubmissionEpochs),
//     slashingQuorum: BigInt(args.slashingQuorum ?? (args.slashingRoundSizeInEpochs * args.aztecEpochDuration) / 2 + 1),
//     slashingRoundSize: BigInt(args.slashingRoundSizeInEpochs * args.aztecEpochDuration),
//     slashingLifetimeInRounds: BigInt(args.slashingLifetimeInRounds),
//     slashingExecutionDelayInRounds: BigInt(args.slashingExecutionDelayInRounds),
//     slashingVetoer: args.slashingVetoer.toString(),
//     manaTarget: args.manaTarget,
//     provingCostPerMana: args.provingCostPerMana,
//     rewardConfig: rewardConfig,
//     version: 0,
//     rewardBoostConfig: getRewardBoostConfig(),
//     stakingQueueConfig: getEntryQueueConfig(networkName),
//     exitDelaySeconds: BigInt(args.exitDelaySeconds),
//     slasherFlavor: slasherFlavorToSolidityEnum(args.slasherFlavor),
//     slashingOffsetInRounds: BigInt(args.slashingOffsetInRounds),
//     slashAmounts: [args.slashAmountSmall, args.slashAmountMedium, args.slashAmountLarge],
//     localEjectionThreshold: args.localEjectionThreshold,
//     slashingDisableDuration: BigInt(args.slashingDisableDuration ?? 0n),
//     earliestRewardsClaimableTimestamp: 0n,
//   };

//   const genesisStateArgs = {
//     vkTreeRoot: args.vkTreeRoot.toString(),
//     protocolContractsHash: args.protocolContractsHash.toString(),
//     genesisArchiveRoot: args.genesisArchiveRoot.toString(),
//   };

//   // Until there is an actual chain-id for the version, we will just draw a random value.
//   // TODO(https://linear.app/aztec-labs/issue/TMNT-139/version-at-deployment)
//   rollupConfigArgs.version = Buffer.from(
//     keccak256String(
//       jsonStringify({
//         rollupConfigArgs,
//         genesisStateArgs,
//       }),
//     ),
//   ).readUint32BE(0);
//   logger.verbose(`Rollup config args`, rollupConfigArgs);

//   const rollupArgs = [
//     addresses.feeJuiceAddress.toString(),
//     addresses.stakingAssetAddress.toString(),
//     addresses.gseAddress.toString(),
//     epochProofVerifier.toString(),
//     extendedClient.account.address,
//     genesisStateArgs,
//     rollupConfigArgs,
//   ] as const;

//   const { address: rollupAddress, existed: rollupExisted } = await deployer.deploy(RollupArtifact, rollupArgs, {
//     gasLimit: 15_000_000n,
//   });
//   logger.verbose(`Deployed Rollup at ${rollupAddress}, already existed: ${rollupExisted}`, rollupConfigArgs);

//   const rollupContract = new RollupContract(extendedClient, rollupAddress);

//   await deployer.waitForDeployments();
//   logger.verbose(`All core contracts have been deployed`);

//   if (args.feeJuicePortalInitialBalance && args.feeJuicePortalInitialBalance > 0n) {
//     // Skip funding when using an external token, as we likely don't have mint permissions
//     if (!('existingTokenAddress' in args) || !args.existingTokenAddress) {
//       const feeJuicePortalAddress = await rollupContract.getFeeJuicePortal();

//       // In fast mode, use the L1TxUtils to send transactions with nonce management
//       const { txHash: mintTxHash } = await deployer.sendTransaction({
//         to: addresses.feeJuiceAddress.toString(),
//         data: encodeFunctionData({
//           abi: FeeAssetArtifact.contractAbi,
//           functionName: 'mint',
//           args: [feeJuicePortalAddress.toString(), args.feeJuicePortalInitialBalance],
//         }),
//       });
//       logger.verbose(
//         `Funding fee juice portal with ${args.feeJuicePortalInitialBalance} fee juice in ${mintTxHash} (accelerated test deployments)`,
//       );
//       txHashes.push(mintTxHash);
//     } else {
//       logger.verbose('Skipping fee juice portal funding due to external token usage');
//     }
//   }

//   const slashFactoryAddress = (await deployer.deploy(SlashFactoryArtifact, [rollupAddress.toString()])).address;
//   logger.verbose(`Deployed SlashFactory at ${slashFactoryAddress}`);

//   // We need to call a function on the registry to set the various contract addresses.
//   const registryContract = getContract({
//     address: getAddress(addresses.registryAddress.toString()),
//     abi: RegistryArtifact.contractAbi,
//     client: extendedClient,
//   });

//   // Only if we are the owner will we be sending these transactions
//   if ((await registryContract.read.owner()) === getAddress(extendedClient.account.address)) {
//     const version = await rollupContract.getVersion();
//     try {
//       const retrievedRollupAddress = await registryContract.read.getRollup([version]);
//       logger.verbose(`Rollup ${retrievedRollupAddress} already exists in registry`);
//     } catch {
//       const { txHash: addRollupTxHash } = await deployer.sendTransaction({
//         to: addresses.registryAddress.toString(),
//         data: encodeFunctionData({
//           abi: RegistryArtifact.contractAbi,
//           functionName: 'addRollup',
//           args: [getAddress(rollupContract.address)],
//         }),
//       });
//       logger.verbose(
//         `Adding rollup ${rollupContract.address} to registry ${addresses.registryAddress} in tx ${addRollupTxHash}`,
//       );

//       txHashes.push(addRollupTxHash);
//     }
//   } else {
//     logger.verbose(`Not the owner of the registry, skipping rollup addition`);
//   }

//   // We need to call a function on the registry to set the various contract addresses.
//   const gseContract = getContract({
//     address: getAddress(addresses.gseAddress.toString()),
//     abi: GSEArtifact.contractAbi,
//     client: extendedClient,
//   });
//   if ((await gseContract.read.owner()) === getAddress(extendedClient.account.address)) {
//     if (!(await gseContract.read.isRollupRegistered([rollupContract.address]))) {
//       const { txHash: addRollupTxHash } = await deployer.sendTransaction({
//         to: addresses.gseAddress.toString(),
//         data: encodeFunctionData({
//           abi: GSEArtifact.contractAbi,
//           functionName: 'addRollup',
//           args: [getAddress(rollupContract.address)],
//         }),
//       });
//       logger.verbose(`Adding rollup ${rollupContract.address} to GSE ${addresses.gseAddress} in tx ${addRollupTxHash}`);

//       // wait for this tx to land in case we have to register initialValidators
//       await extendedClient.waitForTransactionReceipt({ hash: addRollupTxHash });
//     } else {
//       logger.verbose(`Rollup ${rollupContract.address} is already registered in GSE ${addresses.gseAddress}`);
//     }
//   } else {
//     logger.verbose(`Not the owner of the gse, skipping rollup addition`);
//   }

//   const activeAttestorCount = await rollupContract.getActiveAttesterCount();
//   const queuedAttestorCount = await rollupContract.getEntryQueueLength();
//   logger.info(`Rollup has ${activeAttestorCount} active attestors and ${queuedAttestorCount} queued attestors`);

//   const shouldAddValidators = activeAttestorCount === 0n && queuedAttestorCount === 0n;

//   if (
//     args.initialValidators &&
//     shouldAddValidators &&
//     (await gseContract.read.isRollupRegistered([rollupContract.address]))
//   ) {
//     await addMultipleValidators(
//       extendedClient,
//       deployer,
//       addresses.gseAddress.toString(),
//       rollupAddress.toString(),
//       addresses.stakingAssetAddress.toString(),
//       args.initialValidators,
//       args.acceleratedTestDeployments,
//       logger,
//     );
//   }

//   // If the owner is not the Governance contract, transfer ownership to the Governance contract
//   logger.verbose(addresses.governanceAddress.toString());
//   if (getAddress(await rollupContract.getOwner()) !== getAddress(addresses.governanceAddress.toString())) {
//     // TODO(md): add send transaction to the deployer such that we do not need to manage tx hashes here
//     const { txHash: transferOwnershipTxHash } = await deployer.sendTransaction({
//       to: rollupContract.address,
//       data: encodeFunctionData({
//         abi: RegistryArtifact.contractAbi,
//         functionName: 'transferOwnership',
//         args: [getAddress(addresses.governanceAddress.toString())],
//       }),
//     });
//     logger.verbose(
//       `Transferring the ownership of the rollup contract at ${rollupContract.address} to the Governance ${addresses.governanceAddress} in tx ${transferOwnershipTxHash}`,
//     );
//     txHashes.push(transferOwnershipTxHash);
//   }

//   await deployer.waitForDeployments();
//   await Promise.all(txHashes.map(txHash => extendedClient.waitForTransactionReceipt({ hash: txHash })));
//   logger.verbose(`Rollup deployed`);

//   return { rollup: rollupContract, slashFactoryAddress };
// };

// TODO CLAUDE this is currently exactly captured in DeployL1Contracts.s.sol
// BUT we need this to be an alternate entrypoint to that logic for ONLY the rollup.
// We want to expose the below, used in DeploymntConfiguration.sol, from here
// function getRollupConfiguration(IRewardDistributor _rewardDistributor) external view returns (RollupConfigInput memory) {
//     return RollupConfigInput({
//         aztecSlotDuration: vm.envOr("AZTEC_SLOT_DURATION", uint256(36)),
//         aztecEpochDuration: vm.envOr("AZTEC_EPOCH_DURATION", uint256(32)),
//         targetCommitteeSize: vm.envOr("AZTEC_TARGET_COMMITTEE_SIZE", uint256(48)),
//         lagInEpochsForValidatorSet: vm.envOr("AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET", uint256(2)),
//         lagInEpochsForRandao: vm.envOr("AZTEC_LAG_IN_EPOCHS_FOR_RANDAO", uint256(2)),
//         aztecProofSubmissionEpochs: vm.envOr("AZTEC_PROOF_SUBMISSION_EPOCHS", uint256(1)),
//         localEjectionThreshold: vm.envOr("AZTEC_LOCAL_EJECTION_THRESHOLD", uint256(98e18)),
//         slashingQuorum: _getSlashingQuorum(),
//         slashingRoundSize: _getSlashingRoundSize(),
//         slashingLifetimeInRounds: vm.envOr("AZTEC_SLASHING_LIFETIME_IN_ROUNDS", uint256(5)),
//         slashingExecutionDelayInRounds: vm.envOr("AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS", uint256(0)),
//         slashAmounts: _getSlashAmounts(),
//         slashingOffsetInRounds: _getSlashingOffset(),
//         slasherFlavor: _getSlasherFlavor(),
//         slashingVetoer: vm.envOr("AZTEC_SLASHING_VETOER", address(0)),
//         slashingDisableDuration: vm.envOr("AZTEC_SLASHING_DISABLE_DURATION", uint256(5 days)),
//         manaTarget: vm.envOr("AZTEC_MANA_TARGET", uint256(100_000_000)),
//         exitDelaySeconds: vm.envOr("AZTEC_EXIT_DELAY_SECONDS", uint256(2 days)),
//         version: 0,
//         provingCostPerMana: EthValue.wrap(vm.envOr("AZTEC_PROVING_COST_PER_MANA", uint256(100))),
//         rewardConfig: this.getRewardConfiguration(_rewardDistributor),
//         rewardBoostConfig: this.getRewardBoostConfiguration(),
//         stakingQueueConfig: this.getStakingQueueConfiguration(),
//         earliestRewardsClaimableTimestamp: getEarliestRewardsClaimableTimestamp()
//     });
// }
// We want to handle all the pieces from DeployL1Contracts.s.sol that are represented by the above TS code
// the code is complete there, just needs to be refactored out.
// Thus, we will support the rollup upgrade case specifically here.
