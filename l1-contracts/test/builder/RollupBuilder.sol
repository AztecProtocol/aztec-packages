// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Rollup, GenesisState, RollupConfigInput} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {EthValue} from "@aztec/core/interfaces/IRollup.sol";

struct Config {
  address deployer;
  TestERC20 testERC20;
  Registry registry;
  Rollup rollup;
  RewardDistributor rewardDistributor;
  GenesisState genesisState;
  RollupConfigInput rollupConfigInput;
  uint256 mintFeeAmount;
}

/**
 * @title RollupBuilder
 * @notice  A builder to deploy a rollup contract with a given configuration
 *          Using a lot of default values and trying to make it simpler to deal with when we are updating
 *          the constructor and configuration options.
 */
contract RollupBuilder {
  Config public config;

  constructor(address _deployer) {
    config.deployer = _deployer;

    config.genesisState = TestConstants.getGenesisState();
    config.rollupConfigInput = TestConstants.getRollupConfigInput();
  }

  function setTestERC20(address _testERC20) public {
    config.testERC20 = TestERC20(_testERC20);
  }

  function setRegistry(address _registry) public {
    config.registry = Registry(_registry);
  }

  function setGenesisState(GenesisState memory _genesisState) public {
    config.genesisState = _genesisState;
  }

  function setRollupConfigInput(RollupConfigInput memory _rollupConfigInput) public {
    config.rollupConfigInput = _rollupConfigInput;
  }

  function setRewardDistributor(address _rewardDistributor) public {
    config.rewardDistributor = RewardDistributor(_rewardDistributor);
  }

  function setMintFeeAmount(uint256 _mintFeeAmount) public {
    config.mintFeeAmount = _mintFeeAmount;
  }

  /* -------------------------------------------------------------------------- */
  /*                               Rollup config                                */
  /* -------------------------------------------------------------------------- */

  function setProvingCostPerMana(EthValue _provingCostPerMana) public {
    config.rollupConfigInput.provingCostPerMana = _provingCostPerMana;
  }

  function setManaTarget(uint256 _manaTarget) public {
    config.rollupConfigInput.manaTarget = _manaTarget;
  }

  function setSlotDuration(uint256 _slotDuration) public {
    config.rollupConfigInput.aztecSlotDuration = _slotDuration;
  }

  function setEpochDuration(uint256 _epochDuration) public {
    config.rollupConfigInput.aztecEpochDuration = _epochDuration;
  }

  function setProofSubmissionWindow(uint256 _proofSubmissionWindow) public {
    config.rollupConfigInput.aztecProofSubmissionWindow = _proofSubmissionWindow;
  }

  function setSlashingQuorum(uint256 _slashingQuorum) public {
    config.rollupConfigInput.slashingQuorum = _slashingQuorum;
  }

  function setSlashingRoundSize(uint256 _slashingRoundSize) public {
    config.rollupConfigInput.slashingRoundSize = _slashingRoundSize;
  }

  function setTargetCommitteeSize(uint256 _targetCommitteeSize) public {
    config.rollupConfigInput.targetCommitteeSize = _targetCommitteeSize;
  }

  /* -------------------------------------------------------------------------- */
  /*                              Rollup config end                             */
  /* -------------------------------------------------------------------------- */

  function deploy() public {
    if (address(config.testERC20) == address(0)) {
      config.testERC20 = new TestERC20("test", "TEST", address(this));
    }

    if (address(config.registry) == address(0)) {
      config.registry = new Registry(address(this), config.testERC20);
    }

    if (address(config.rewardDistributor) == address(0)) {
      config.rewardDistributor = RewardDistributor(address(config.registry.getRewardDistributor()));
    }

    if (address(config.rollup) == address(0)) {
      config.rollup = new Rollup(
        config.testERC20,
        config.rewardDistributor,
        config.testERC20,
        address(this),
        config.genesisState,
        config.rollupConfigInput
      );
    }

    config.registry.addRollup(config.rollup);

    config.testERC20.mint(
      address(config.rewardDistributor), 1e6 * config.rewardDistributor.BLOCK_REWARD()
    );
    config.testERC20.mint(address(config.rollup.getFeeAssetPortal()), config.mintFeeAmount);

    config.testERC20.transferOwnership(address(config.deployer));
    config.registry.transferOwnership(address(config.deployer));
    config.rollup.transferOwnership(address(config.deployer));
  }

  function getConfig() public view returns (Config memory) {
    return config;
  }
}
