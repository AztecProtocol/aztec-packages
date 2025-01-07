// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {StakingCheater} from "./StakingCheater.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract StakingBase is TestBase {
  StakingCheater internal staking;
  TestERC20 internal stakingAsset;

  uint256 internal constant MINIMUM_STAKE = 100e18;

  address internal constant PROPOSER = address(bytes20("PROPOSER"));
  address internal constant ATTESTER = address(bytes20("ATTESTER"));
  address internal constant WITHDRAWER = address(bytes20("WITHDRAWER"));
  address internal constant RECIPIENT = address(bytes20("RECIPIENT"));

  address internal SLASHER;

  function setUp() public virtual {
    stakingAsset = new TestERC20("test", "TEST", address(this));
    staking = new StakingCheater(stakingAsset, MINIMUM_STAKE, 1, 1);

    SLASHER = address(staking.SLASHER());
  }
}
