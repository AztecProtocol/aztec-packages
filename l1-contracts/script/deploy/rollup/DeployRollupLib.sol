// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order, max-states-count, gas-small-strings, comprehensive-interface
pragma solidity >=0.8.27;

import {Vm} from "forge-std/Vm.sol";

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {Rollup} from "@aztec/core/Rollup.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";

import {HonkVerifier} from "../../../generated/HonkVerifier.sol";

import {IRollupConfiguration} from "./RollupConfiguration.sol";

/// @notice Input addresses required for rollup deployment (existing L1 infrastructure)
struct RollupAddressInput {
    address deployer;
    Registry registry;
    GSE gse;
    Governance governance;
    IERC20 feeAsset;
    IERC20 stakingAsset;
    IRewardDistributor rewardDistributor;
}

/// @notice Output addresses from rollup deployment (newly deployed contracts)
struct RollupAddressOutput {
    Rollup rollup;
    IVerifier verifier;
    SlashFactory slashFactory;
}

/// @title DeployRollupLib
/// @author Aztec Labs
/// @notice Library for deploying rollup contracts. Used by DeployL1Contracts and DeployRollupForUpgrade.
library DeployRollupLib {
    function deployRollup(RollupAddressInput memory input, IRollupConfiguration config)
        internal
        returns (RollupAddressOutput memory output)
    {
        output.verifier = _deployVerifier(config);
        output.rollup = _deployRollupContract(input, output.verifier, config);
        _maybeMintInitialFeeAsset(input, output.rollup, config);
        output.slashFactory = new SlashFactory(output.rollup);
        _maybeRegisterRollup(input, output.rollup);
        _maybeAddInitialValidators(input, output.rollup, config);
        _transferOwnership(input, output.rollup);
    }

    function writeRollupAddressesToJson(Vm vm, string memory jsonKey, RollupAddressOutput memory output)
        internal
        returns (string memory)
    {
        vm.serializeAddress(jsonKey, "rollupAddress", address(output.rollup));
        vm.serializeAddress(jsonKey, "verifierAddress", address(output.verifier));
        vm.serializeAddress(jsonKey, "slashFactoryAddress", address(output.slashFactory));
        vm.serializeAddress(jsonKey, "inboxAddress", address(output.rollup.getInbox()));
        vm.serializeAddress(jsonKey, "outboxAddress", address(output.rollup.getOutbox()));
        vm.serializeAddress(jsonKey, "feeAssetPortalAddress", address(output.rollup.getFeeAssetPortal()));
        return vm.serializeUint(jsonKey, "rollupVersion", output.rollup.getVersion());
    }

    function _deployVerifier(IRollupConfiguration config) private returns (IVerifier) {
        if (!config.useRealVerifier()) {
            return new MockVerifier();
        } else {
            return IVerifier(address(new HonkVerifier()));
        }
    }

    function _deployRollupContract(
        RollupAddressInput memory input,
        IVerifier verifier,
        IRollupConfiguration config
    ) private returns (Rollup) {
        GenesisState memory genesisState = config.getGenesisState();
        RollupConfigInput memory rollupConfigInput =
            config.getRollupConfiguration(IRewardDistributor(address(input.rewardDistributor)));

        return new Rollup(
            input.feeAsset,
            input.stakingAsset,
            input.gse,
            verifier,
            input.deployer,
            genesisState,
            rollupConfigInput
        );
    }

    function _maybeMintInitialFeeAsset(
        RollupAddressInput memory input,
        Rollup rollup,
        IRollupConfiguration config
    ) private {
        uint256 initialFeeAssetAmount = config.getFeeJuicePortalInitialBalance();
        if (initialFeeAssetAmount > 0) {
            address feeAssetPortal = address(rollup.getFeeAssetPortal());
            TestERC20(address(input.feeAsset)).mint(feeAssetPortal, initialFeeAssetAmount);
        }
    }

    function _maybeRegisterRollup(RollupAddressInput memory input, Rollup rollup) private {
        if (input.registry.owner() == input.deployer) {
            input.registry.addRollup(rollup);
        }
        if (input.gse.owner() == input.deployer) {
            input.gse.addRollup(address(rollup));
        }
    }

 // TODO CLAUDE MAKE SURE THIS MATCHES THE LOGIC BELOW
// /*
//  * Adds multiple validators to the rollup
//  *
//  * @param extendedClient - The L1 clients.
//  * @param deployer - The L1 deployer.
//  * @param rollupAddress - The address of the rollup.
//  * @param stakingAssetAddress - The address of the staking asset.
//  * @param validators - The validators to initialize.
//  * @param acceleratedTestDeployments - Whether to use accelerated test deployments.
//  * @param logger - The logger.
//  */
// export const addMultipleValidators = async (
//   extendedClient: ExtendedViemWalletClient,
//   deployer: L1Deployer,
//   gseAddress: Hex,
//   rollupAddress: Hex,
//   stakingAssetAddress: Hex,
//   validators: Operator[],
//   acceleratedTestDeployments: boolean | undefined,
//   logger: Logger,
// ) => {
//   const rollup = new RollupContract(extendedClient, rollupAddress);
//   const activationThreshold = await rollup.getActivationThreshold();
//   if (validators && validators.length > 0) {
//     // Check if some of the initial validators are already registered, so we support idempotent deployments
//     if (!acceleratedTestDeployments) {
//       const enrichedValidators = await Promise.all(
//         validators.map(async operator => ({
//           operator,
//           status: await rollup.getStatus(operator.attester),
//         })),
//       );
//       const existingValidators = enrichedValidators.filter(v => v.status !== 0);
//       if (existingValidators.length > 0) {
//         logger.warn(
//           `Validators ${existingValidators
//             .map(v => v.operator.attester)
//             .join(', ')} already exist. Skipping from initialization.`,
//         );
//       }

//       validators = enrichedValidators.filter(v => v.status === 0).map(v => v.operator);
//     }

//     if (validators.length === 0) {
//       logger.warn('No validators to add. Skipping.');
//       return;
//     }

//     const gseContract = new GSEContract(extendedClient, gseAddress);
//     const multiAdder = (await deployer.deploy(MultiAdderArtifact, [rollupAddress, deployer.client.account.address]))
//       .address;

//     const makeValidatorTuples = async (validator: Operator) => {
//       const registrationTuple = await gseContract.makeRegistrationTuple(validator.bn254SecretKey.getValue());
//       return {
//         attester: getAddress(validator.attester.toString()),
//         withdrawer: getAddress(validator.withdrawer.toString()),
//         ...registrationTuple,
//       };
//     };

//     const validatorsTuples = await Promise.all(validators.map(makeValidatorTuples));

//     // Mint tokens, approve them, use cheat code to initialize validator set without setting up the epoch.
//     const stakeNeeded = activationThreshold * BigInt(validators.length);

//     await deployer.l1TxUtils.sendAndMonitorTransaction({
//       to: stakingAssetAddress,
//       data: encodeFunctionData({
//         abi: StakingAssetArtifact.contractAbi,
//         functionName: 'mint',
//         args: [multiAdder.toString(), stakeNeeded],
//       }),
//     });

//     const entryQueueLengthBefore = await rollup.getEntryQueueLength();
//     const validatorCountBefore = await rollup.getActiveAttesterCount();

//     logger.info(`Adding ${validators.length} validators to the rollup`);

//     const chunkSize = 16;

//     // We will add `chunkSize` validators to the queue until we have covered all of our validators.
//     // The `chunkSize` needs to be small enough to fit inside a single tx, therefore 16.
//     for (const c of chunk(validatorsTuples, chunkSize)) {
//       await deployer.l1TxUtils.sendAndMonitorTransaction(
//         {
//           to: multiAdder.toString(),
//           data: encodeFunctionData({
//             abi: MultiAdderArtifact.contractAbi,
//             functionName: 'addValidators',
//             args: [c, BigInt(0)],
//           }),
//         },
//         {
//           gasLimit: 16_000_000n,
//         },
//       );
//     }

//     // After adding to the queue, we will now try to flush from it.
//     // We are explicitly doing this as a second step instead of as part of adding to benefit
//     // from the accounting used to speed the process up.
//     // As the queue computes the amount of possible flushes in an epoch when told to flush,
//     // waiting until we have added all we want allows us to benefit in the case were we added
//     // enough to pass the bootstrap set size without needing to wait another epoch.
//     // This is useful when we are testing as it speeds up the tests slightly.
//     while (true) {
//       // If the queue is empty, we can break
//       if ((await rollup.getEntryQueueLength()) == 0n) {
//         break;
//       }

//       // If there are no available validator flushes, no need to even try
//       if ((await rollup.getAvailableValidatorFlushes()) == 0n) {
//         break;
//       }

//       // Note that we are flushing at most `chunkSize` at each call
//       await deployer.l1TxUtils.sendAndMonitorTransaction(
//         {
//           to: rollup.address,
//           data: encodeFunctionData({
//             abi: RollupArtifact.contractAbi,
//             functionName: 'flushEntryQueue',
//             args: [BigInt(chunkSize)],
//           }),
//         },
//         {
//           gasLimit: 16_000_000n,
//         },
//       );
//     }

//     const entryQueueLengthAfter = await rollup.getEntryQueueLength();
//     const validatorCountAfter = await rollup.getActiveAttesterCount();

//     if (
//       entryQueueLengthAfter + validatorCountAfter <
//       entryQueueLengthBefore + validatorCountBefore + BigInt(validators.length)
//     ) {
//       throw new Error(
//         `Failed to add ${validators.length} validators. Active validators: ${validatorCountBefore} -> ${validatorCountAfter}. Queue: ${entryQueueLengthBefore} -> ${entryQueueLengthAfter}. A likely issue is the bootstrap size.`,
//       );
//     }

//     logger.info(
//       `Added ${validators.length} validators. Active validators: ${validatorCountBefore} -> ${validatorCountAfter}. Queue: ${entryQueueLengthBefore} -> ${entryQueueLengthAfter}`,
//     );
//   }
// };

    function _maybeAddInitialValidators(
        RollupAddressInput memory input,
        Rollup rollup,
        IRollupConfiguration config
    ) private {
        CheatDepositArgs[] memory initialValidators = config.parseValidators();
        if (initialValidators.length == 0) {
            return;
        }

        MultiAdder multiAdder = new MultiAdder(address(rollup), input.deployer);

        uint256 activationThreshold = rollup.getActivationThreshold();
        uint256 stakeNeeded = activationThreshold * initialValidators.length;
        TestERC20(address(input.stakingAsset)).mint(address(multiAdder), stakeNeeded);

        uint256 chunkSize = 16;
        for (uint256 i = 0; i < initialValidators.length; i += chunkSize) {
            uint256 end = i + chunkSize > initialValidators.length ? initialValidators.length : i + chunkSize;
            uint256 chunkLen = end - i;

            CheatDepositArgs[] memory chunk = new CheatDepositArgs[](chunkLen);
            for (uint256 j = 0; j < chunkLen; ++j) {
                chunk[j] = initialValidators[i + j];
            }

            multiAdder.addValidators(chunk, 0);
        }

        uint256 flushChunkSize = 16;
        while (true) {
            uint256 queueLength = rollup.getEntryQueueLength();
            if (queueLength == 0) break;

            uint256 availableFlushes = rollup.getAvailableValidatorFlushes();
            if (availableFlushes == 0) break;

            rollup.flushEntryQueue(flushChunkSize);
        }
    }

    function _transferOwnership(RollupAddressInput memory input, Rollup rollup) private {
        if (rollup.owner() == input.deployer) {
            rollup.transferOwnership(address(input.governance));
        }
    }
}
