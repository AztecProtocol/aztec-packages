// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

contract FakeRollup {
  function getVersion() external view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(bytes("aztec_rollup"), block.chainid, address(this))));
  }
}

contract RewardDistributorBase is Test {
  IMintableERC20 internal token;
  Registry internal registry;
  RewardDistributor internal rewardDistributor;

  function setUp() public {
    token = IMintableERC20(address(new TestERC20("test", "TEST", address(this))));
    registry = new Registry(address(this), token);

    rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));

    registry.addRollup(IRollup(address(new FakeRollup())));
  }
}
