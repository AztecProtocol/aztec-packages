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

  function setTestERC20(address _testERC20) public returns (RollupBuilder) {
    config.testERC20 = TestERC20(_testERC20);
    return this;
  }

  function setRegistry(address _registry) public returns (RollupBuilder) {
    config.registry = Registry(_registry);
    return this;
  }

  function setGenesisState(GenesisState memory _genesisState) public returns (RollupBuilder) {
    config.genesisState = _genesisState;
    return this;
  }

  function setRollupConfigInput(RollupConfigInput memory _rollupConfigInput)
    public
    returns (RollupBuilder)
  {
    config.rollupConfigInput = _rollupConfigInput;
    return this;
  }

  function setRewardDistributor(address _rewardDistributor) public returns (RollupBuilder) {
    config.rewardDistributor = RewardDistributor(_rewardDistributor);
    return this;
  }

  function setMintFeeAmount(uint256 _mintFeeAmount) public returns (RollupBuilder) {
    config.mintFeeAmount = _mintFeeAmount;
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /*                               Rollup config                                */
  /* -------------------------------------------------------------------------- */

  function setProvingCostPerMana(EthValue _provingCostPerMana) public returns (RollupBuilder) {
    config.rollupConfigInput.provingCostPerMana = _provingCostPerMana;
    return this;
  }

  function setManaTarget(uint256 _manaTarget) public returns (RollupBuilder) {
    config.rollupConfigInput.manaTarget = _manaTarget;
    return this;
  }

  function setSlotDuration(uint256 _slotDuration) public returns (RollupBuilder) {
    config.rollupConfigInput.aztecSlotDuration = _slotDuration;
    return this;
  }

  function setEpochDuration(uint256 _epochDuration) public returns (RollupBuilder) {
    config.rollupConfigInput.aztecEpochDuration = _epochDuration;
    return this;
  }

  function setProofSubmissionWindow(uint256 _proofSubmissionWindow) public returns (RollupBuilder) {
    config.rollupConfigInput.aztecProofSubmissionWindow = _proofSubmissionWindow;
    return this;
  }

  function setSlashingQuorum(uint256 _slashingQuorum) public returns (RollupBuilder) {
    config.rollupConfigInput.slashingQuorum = _slashingQuorum;
    return this;
  }

  function setSlashingRoundSize(uint256 _slashingRoundSize) public returns (RollupBuilder) {
    config.rollupConfigInput.slashingRoundSize = _slashingRoundSize;
    return this;
  }

  function setTargetCommitteeSize(uint256 _targetCommitteeSize) public returns (RollupBuilder) {
    config.rollupConfigInput.targetCommitteeSize = _targetCommitteeSize;
    return this;
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
