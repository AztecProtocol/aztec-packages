// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {GSE} from "@aztec/governance/GSE.sol";
import {GSEWithSkip} from "@test/GSEWithSkip.sol";
import {TestBase} from "@test/base/Base.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";

import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";

struct Flags {
  bool openFloodgates;
  bool checkProofOfPossession;
}

struct Values {
  uint256 govProposerN;
  uint256 govProposerM;
}

struct Config {
  address owner;
  TestERC20 testERC20;
  GSE gse;
  Governance governance;
  Registry registry;
  RewardDistributor rewardDistributor;
  Values values;
  Flags flags;
}

contract GSEBuilder is TestBase {
  using stdStorage for StdStorage;

  Config internal config;

  constructor() {
    config.values.govProposerN = 1;
    config.values.govProposerM = 1;
    config.flags.openFloodgates = true;
    config.flags.checkProofOfPossession = false;
  }

  function setOpenFloodgates(bool _openFloodgates) public returns (GSEBuilder) {
    config.flags.openFloodgates = _openFloodgates;
    return this;
  }

  function setGovProposerN(uint256 _govProposerN) public returns (GSEBuilder) {
    config.values.govProposerN = _govProposerN;
    return this;
  }

  function setGovProposerM(uint256 _govProposerM) public returns (GSEBuilder) {
    config.values.govProposerM = _govProposerM;
    return this;
  }

  function deploy() public returns (GSEBuilder) {
    if (address(config.testERC20) == address(0)) {
      config.testERC20 = new TestERC20("test", "TEST", address(this));
      vm.label(address(config.testERC20), "TestERC20");
    }

    if (address(config.gse) == address(0)) {
      config.gse = new GSEWithSkip(
        address(this), config.testERC20, TestConstants.ACTIVATION_THRESHOLD, TestConstants.EJECTION_THRESHOLD
      );
      vm.label(address(config.gse), "GSE");

      GSEWithSkip(address(config.gse)).setCheckProofOfPossession(config.flags.checkProofOfPossession);
    }

    if (address(config.registry) == address(0)) {
      config.registry = new Registry(address(this), config.testERC20);
      config.rewardDistributor = RewardDistributor(address(config.registry.getRewardDistributor()));
      vm.label(address(config.registry), "Registry");
      vm.label(address(config.rewardDistributor), "RewardDistributor");
    }

    GovernanceProposer proposer =
      new GovernanceProposer(config.registry, config.gse, config.values.govProposerN, config.values.govProposerM);
    config.governance = new Governance(
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

    vm.startPrank(config.registry.owner());
    config.registry.transferOwnership(address(config.governance));
    vm.stopPrank();

    vm.startPrank(config.gse.owner());
    config.gse.transferOwnership(address(config.governance));
    vm.stopPrank();

    vm.startPrank(config.testERC20.owner());
    config.testERC20.transferOwnership(address(config.governance));
    vm.stopPrank();

    return this;
  }

  function getConfig() public view returns (Config memory) {
    return config;
  }
}
