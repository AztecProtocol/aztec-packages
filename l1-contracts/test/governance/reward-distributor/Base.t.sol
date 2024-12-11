// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract RewardDistributorBase is Test {
  IMintableERC20 internal token;
  Registry internal registry;
  RewardDistributor internal rewardDistributor;

  function setUp() public {
    token = IMintableERC20(address(new TestERC20("test", "TEST", address(this))));
    registry = new Registry(address(this));
    rewardDistributor = new RewardDistributor(token, registry, address(this));
  }
}
