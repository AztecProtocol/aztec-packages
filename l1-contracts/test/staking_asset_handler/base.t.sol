// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {StakingCheater} from "./../staking/StakingCheater.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";

// solhint-disable comprehensive-interface

contract StakingAssetHandlerBase is TestBase {
  StakingCheater internal staking;
  TestERC20 internal stakingAsset;
  StakingAssetHandler internal stakingAssetHandler;

  uint256 internal constant MINIMUM_STAKE = 100e18;

  address internal constant PROPOSER = address(bytes20("PROPOSER"));
  address internal constant ATTESTER = address(bytes20("ATTESTER"));
  address internal constant WITHDRAWER = address(bytes20("WITHDRAWER"));
  address internal constant RECIPIENT = address(bytes20("RECIPIENT"));

  function setUp() public virtual {
    stakingAsset = new TestERC20("test", "TEST", address(this));
    staking = new StakingCheater(stakingAsset, MINIMUM_STAKE, 1, 1);
  }
}
