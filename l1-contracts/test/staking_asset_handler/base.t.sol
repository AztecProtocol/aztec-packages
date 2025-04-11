// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {StakingCheater} from "./../staking/StakingCheater.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
// solhint-disable comprehensive-interface

contract StakingAssetHandlerBase is TestBase {
  StakingCheater internal staking;
  TestERC20 internal stakingAsset;
  Registry internal registry;
  StakingAssetHandler internal stakingAssetHandler;

  uint256 internal constant MINIMUM_STAKE = 100e18;

  address internal constant PROPOSER = address(bytes20("PROPOSER"));
  address internal constant ATTESTER = address(bytes20("ATTESTER"));
  address internal constant WITHDRAWER = address(bytes20("WITHDRAWER"));
  address internal constant RECIPIENT = address(bytes20("RECIPIENT"));

  uint256 internal mintInterval = 1;
  uint256 internal depositsPerMint = 1;

  function setUp() public virtual {
    stakingAsset = new TestERC20("test", "TEST", address(this));

    // We are just using the staking asset for rewards as well here as we don't care about the rewards
    // in these tests.
    registry = new Registry(address(this), stakingAsset);

    staking = new StakingCheater(stakingAsset, MINIMUM_STAKE, 1, 1);

    registry.addRollup(IRollup(address(staking)));

    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      registry,
      WITHDRAWER,
      mintInterval,
      depositsPerMint,
      new address[](0)
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
  }
}
