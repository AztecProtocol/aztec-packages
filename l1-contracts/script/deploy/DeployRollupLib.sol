// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order, max-states-count, gas-small-strings, comprehensive-interface
pragma solidity >=0.8.27;

import {Vm} from "forge-std/Vm.sol";

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";

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

import {HonkVerifier} from "../../generated/HonkVerifier.sol";

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
/// @notice Library for deploying rollup contracts. Used by DeployAztecL1Contracts and DeployRollupForUpgrade.
library DeployRollupLib {
  function deployRollup(RollupAddressInput memory input, IRollupConfiguration config)
    internal
    returns (RollupAddressOutput memory output)
  {
    output.verifier = _deployVerifier(config);
    output.rollup = _deployRollupContract(input, output.verifier, config);
    output.slashFactory = new SlashFactory(output.rollup);
    _maybeMintInitialFeeAsset(input, output.rollup, config);
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
    vm.serializeAddress(jsonKey, "feeJuicePortalAddress", address(output.rollup.getFeeAssetPortal()));
    return vm.serializeUint(jsonKey, "rollupVersion", output.rollup.getVersion());
  }

  function _deployVerifier(IRollupConfiguration config) private returns (IVerifier) {
    if (!config.useRealVerifier()) {
      return new MockVerifier(); // aka MonkVerifier
    } else {
      return IVerifier(address(new HonkVerifier()));
    }
  }

  function _deployRollupContract(RollupAddressInput memory input, IVerifier verifier, IRollupConfiguration config)
    private
    returns (Rollup)
  {
    GenesisState memory genesisState = config.getGenesisState();
    RollupConfigInput memory rollupConfigInput =
      config.getRollupConfiguration(IRewardDistributor(address(input.rewardDistributor)));

    return new Rollup(
      input.feeAsset, input.stakingAsset, input.gse, verifier, input.deployer, genesisState, rollupConfigInput
    );
  }

  function _maybeMintInitialFeeAsset(RollupAddressInput memory input, Rollup rollup, IRollupConfiguration config)
    private
  {
    // Mints block rewards for 10000 blocks to the rewardDistributor contract
    uint256 initialFeeAssetAmount = config.getFeeJuicePortalInitialBalance();
    if (initialFeeAssetAmount > 0) {
      // NOTE(AD): This hack is needed for tests where the fee asset is a non-mintable token.
      try Ownable(address(input.feeAsset)).owner() returns (address owner) {
        if (owner == input.deployer) {
          address feeAssetPortal = address(rollup.getFeeAssetPortal());
          TestERC20(address(input.feeAsset)).mint(feeAssetPortal, initialFeeAssetAmount);
        }
      } catch {
        // Ignore if fee asset is not mintable or ownable
      }
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

  function _maybeAddInitialValidators(RollupAddressInput memory input, Rollup rollup, IRollupConfiguration config)
    private
  {
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
