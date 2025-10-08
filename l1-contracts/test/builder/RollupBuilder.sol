// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Rollup, GenesisState, RollupConfigInput} from "@aztec/core/Rollup.sol";
import {RollupWithPreheating} from "../RollupWithPreheating.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {EthValue} from "@aztec/core/interfaces/IRollup.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Test} from "forge-std/Test.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {CoinIssuer} from "@aztec/governance/CoinIssuer.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {GSEWithSkip} from "@test/GSEWithSkip.sol";
import {TestGov} from "@test/governance/helpers/TestGov.sol";

// Stack the layers to avoid the stack too deep 🧌
struct ConfigFlags {
  bool makeCanonical;
  bool makeGovernance;
  bool updateOwnerships;
  bool openFloodgates;
  bool checkProofOfPossession;
}

struct ConfigValues {
  uint256 mintFeeAmount;
  uint256 govProposerN;
  uint256 govProposerM;
}

struct Config {
  address deployer;
  CoinIssuer coinIssuer;
  TestERC20 testERC20;
  Registry registry;
  Governance governance;
  RollupWithPreheating rollup;
  GSE gse;
  RewardDistributor rewardDistributor;
  GenesisState genesisState;
  RollupConfigInput rollupConfigInput;
  ConfigValues values;
  ConfigFlags flags;
  CheatDepositArgs[] validators;
}

/**
 * @title RollupBuilder
 * @notice  A builder to deploy a rollup contract with a given configuration
 *          Using a lot of default values and trying to make it simpler to deal with when we are updating
 *          the constructor and configuration options.
 */
contract RollupBuilder is Test {
  using stdStorage for StdStorage;

  Config public config;

  constructor(address _deployer) {
    config.deployer = _deployer;

    config.genesisState = TestConstants.getGenesisState();
    config.rollupConfigInput = TestConstants.getRollupConfigInput();

    config.values.govProposerN = 1;
    config.values.govProposerM = 1;

    config.flags.makeCanonical = true;
    config.flags.makeGovernance = true;
    config.flags.updateOwnerships = true;
    config.flags.openFloodgates = true;
    config.flags.checkProofOfPossession = false;
  }

  function setTestERC20(TestERC20 _testERC20) public returns (RollupBuilder) {
    config.testERC20 = _testERC20;
    return this;
  }

  function setRegistry(Registry _registry) public returns (RollupBuilder) {
    config.registry = _registry;
    return this;
  }

  function setGSE(GSE _gse) public returns (RollupBuilder) {
    config.gse = _gse;
    return this;
  }

  function setGenesisState(GenesisState memory _genesisState) public returns (RollupBuilder) {
    config.genesisState = _genesisState;
    return this;
  }

  function setRollupConfigInput(RollupConfigInput memory _rollupConfigInput) public returns (RollupBuilder) {
    config.rollupConfigInput = _rollupConfigInput;
    return this;
  }

  function setRewardDistributor(RewardDistributor _rewardDistributor) public returns (RollupBuilder) {
    config.rewardDistributor = _rewardDistributor;
    return this;
  }

  function setMintFeeAmount(uint256 _mintFeeAmount) public returns (RollupBuilder) {
    config.values.mintFeeAmount = _mintFeeAmount;
    return this;
  }

  function setGovProposerN(uint256 _govProposerN) public returns (RollupBuilder) {
    config.values.govProposerN = _govProposerN;
    return this;
  }

  function setGovProposerM(uint256 _govProposerM) public returns (RollupBuilder) {
    config.values.govProposerM = _govProposerM;
    return this;
  }

  function setMakeCanonical(bool _makeCanonical) public returns (RollupBuilder) {
    config.flags.makeCanonical = _makeCanonical;
    return this;
  }

  function setMakeGovernance(bool _makeGovernance) public returns (RollupBuilder) {
    config.flags.makeGovernance = _makeGovernance;
    return this;
  }

  function setUpdateOwnerships(bool _updateOwnerships) public returns (RollupBuilder) {
    config.flags.updateOwnerships = _updateOwnerships;
    return this;
  }

  function setOpenFloodgates(bool _openFloodgates) public returns (RollupBuilder) {
    config.flags.openFloodgates = _openFloodgates;
    return this;
  }

  function setCheckProofOfPossession(bool _checkProofOfPossession) public returns (RollupBuilder) {
    config.flags.checkProofOfPossession = _checkProofOfPossession;
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

  function setProofSubmissionEpochs(uint256 _proofSubmissionEpochs) public returns (RollupBuilder) {
    config.rollupConfigInput.aztecProofSubmissionEpochs = _proofSubmissionEpochs;
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

  function setSlashingLifetimeInRounds(uint256 _slashingLifetimeInRounds) public returns (RollupBuilder) {
    config.rollupConfigInput.slashingLifetimeInRounds = _slashingLifetimeInRounds;
    return this;
  }

  function setSlashingExecutionDelayInRounds(uint256 _slashingExecutionDelayInRounds) public returns (RollupBuilder) {
    config.rollupConfigInput.slashingExecutionDelayInRounds = _slashingExecutionDelayInRounds;
    return this;
  }

  function setSlashingOffsetInRounds(uint256 _slashingOffsetInRounds) public returns (RollupBuilder) {
    config.rollupConfigInput.slashingOffsetInRounds = _slashingOffsetInRounds;
    return this;
  }

  function setSlashAmountSmall(uint256 _slashAmountSmall) public returns (RollupBuilder) {
    config.rollupConfigInput.slashAmounts[0] = _slashAmountSmall;
    return this;
  }

  function setSlashAmountMedium(uint256 _slashAmountMedium) public returns (RollupBuilder) {
    config.rollupConfigInput.slashAmounts[1] = _slashAmountMedium;
    return this;
  }

  function setSlashAmountLarge(uint256 _slashAmountLarge) public returns (RollupBuilder) {
    config.rollupConfigInput.slashAmounts[2] = _slashAmountLarge;
    return this;
  }

  function setSlasherFlavor(SlasherFlavor _slasherFlavor) public returns (RollupBuilder) {
    config.rollupConfigInput.slasherFlavor = _slasherFlavor;
    return this;
  }

  function setTargetCommitteeSize(uint256 _targetCommitteeSize) public returns (RollupBuilder) {
    config.rollupConfigInput.targetCommitteeSize = _targetCommitteeSize;
    return this;
  }

  function setStakingQueueConfig(StakingQueueConfig memory _stakingQueueConfig) public returns (RollupBuilder) {
    config.rollupConfigInput.stakingQueueConfig = _stakingQueueConfig;
    return this;
  }

  function setEntryQueueFlushSizeMin(uint256 _flushSizeMin) public returns (RollupBuilder) {
    config.rollupConfigInput.stakingQueueConfig.normalFlushSizeMin = _flushSizeMin;
    return this;
  }

  function setEntryQueueFlushSizeQuotient(uint256 _flushSizeQuotient) public returns (RollupBuilder) {
    config.rollupConfigInput.stakingQueueConfig.normalFlushSizeQuotient = _flushSizeQuotient;
    return this;
  }

  function setValidators(CheatDepositArgs[] memory _validators) public returns (RollupBuilder) {
    for (uint256 i = 0; i < _validators.length; i++) {
      config.validators.push(_validators[i]);
    }
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /*                              Rollup config end                             */
  /* -------------------------------------------------------------------------- */

  function deploy() public returns (RollupBuilder) {
    if (address(config.testERC20) == address(0)) {
      config.testERC20 = new TestERC20("test", "TEST", address(this));
    }

    if (address(config.coinIssuer) == address(0)) {
      config.coinIssuer = new CoinIssuer(config.testERC20, TestConstants.AZTEC_COIN_ISSUER_RATE, address(this));
    }

    if (address(config.gse) == address(0)) {
      config.gse = new GSEWithSkip(
        address(this), config.testERC20, TestConstants.ACTIVATION_THRESHOLD, TestConstants.EJECTION_THRESHOLD
      );

      GSEWithSkip(address(config.gse)).setCheckProofOfPossession(config.flags.checkProofOfPossession);
    }

    if (address(config.registry) == address(0)) {
      config.registry = new Registry(address(this), config.testERC20);
      config.rewardDistributor = RewardDistributor(address(config.registry.getRewardDistributor()));
    } else {
      config.rewardDistributor = RewardDistributor(address(config.registry.getRewardDistributor()));
    }

    if (config.flags.makeGovernance) {
      GovernanceProposer proposer =
        new GovernanceProposer(config.registry, config.gse, config.values.govProposerN, config.values.govProposerM);
      config.governance = new TestGov(
        config.testERC20, address(proposer), address(config.gse), TestConstants.getGovernanceConfiguration()
      );
      vm.label(address(config.governance), "Governance");
      vm.label(address(proposer), "GovernanceProposer");

      vm.prank(config.gse.owner());
      config.gse.setGovernance(config.governance);

      if (config.flags.openFloodgates) {
        vm.prank(address(config.governance));
        config.governance.openFloodgates();

        assertEq(config.governance.isAllBeneficiariesAllowed(), true);
      }
    }

    config.rollupConfigInput.rewardConfig.rewardDistributor = config.rewardDistributor;

    config.rollup = new RollupWithPreheating(
      config.testERC20,
      config.testERC20,
      config.gse,
      new MockVerifier(),
      address(this),
      config.genesisState,
      config.rollupConfigInput
    );

    if (config.flags.makeCanonical) {
      address feeAssetPortal = address(config.rollup.getFeeAssetPortal());

      vm.prank(config.testERC20.owner());
      config.testERC20.mint(feeAssetPortal, config.values.mintFeeAmount);

      config.testERC20.mint(address(config.rewardDistributor), 1e6 * config.rollup.getBlockReward());

      vm.prank(config.registry.owner());
      config.registry.addRollup(config.rollup);

      vm.prank(config.gse.owner());
      config.gse.addRollup(address(config.rollup));
    }

    if (config.validators.length > 0) {
      MultiAdder multiAdder = new MultiAdder(address(config.rollup), address(this));
      config.testERC20.mint(address(multiAdder), config.gse.ACTIVATION_THRESHOLD() * config.validators.length);
      multiAdder.addValidators(config.validators);
    }

    if (config.flags.updateOwnerships) {
      if (address(config.coinIssuer) != config.testERC20.owner()) {
        vm.prank(config.testERC20.owner());
        config.testERC20.transferOwnership(address(config.coinIssuer));
        config.coinIssuer.acceptTokenOwnership();
      }

      if (config.deployer != config.registry.owner()) {
        vm.prank(config.registry.owner());
        config.registry.transferOwnership(config.deployer);
      }

      address expGov = config.flags.makeGovernance ? address(config.governance) : config.deployer;
      if (expGov != config.rollup.owner()) {
        vm.prank(config.rollup.owner());
        config.rollup.transferOwnership(expGov);
      }

      if (expGov != config.gse.owner()) {
        vm.prank(config.gse.owner());
        config.gse.transferOwnership(expGov);
      }

      if (expGov != config.coinIssuer.owner()) {
        vm.prank(config.coinIssuer.owner());
        config.coinIssuer.transferOwnership(expGov);
      }
    }

    vm.label(address(config.rollup), "Rollup");
    vm.label(address(config.registry), "Registry");
    vm.label(address(config.gse), "GSE");
    vm.label(address(config.rewardDistributor), "RewardDistributor");
    vm.label(address(config.testERC20), "TestERC20");

    return this;
  }

  function getConfig() public view returns (Config memory) {
    return config;
  }
}
