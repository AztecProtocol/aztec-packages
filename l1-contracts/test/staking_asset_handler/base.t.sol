// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {ZKPassportBase} from "./zkpassport/ZKPassportBase.sol";

// solhint-disable comprehensive-interface

contract StakingAssetHandlerBase is ZKPassportBase, TestBase {
  TestERC20 internal stakingAsset;
  Registry internal registry;
  StakingAssetHandler internal stakingAssetHandler;

  address internal constant RECIPIENT = address(bytes20("RECIPIENT"));

  uint256 internal faucetAmount = 1_000_000 * 1e18; // 1M STK

  function setUp() public virtual {
    RollupBuilder builder = new RollupBuilder(address(this));

    builder.deploy();

    stakingAsset = builder.getConfig().testERC20;
    registry = builder.getConfig().registry;

    StakingAssetHandler.StakingAssetHandlerArgs memory stakingAssetHandlerArgs =
      StakingAssetHandler.StakingAssetHandlerArgs({
        owner: address(this),
        stakingAsset: address(stakingAsset),
        registry: registry,
        faucetAmount: faucetAmount,
        zkPassportVerifier: zkPassportVerifier,
        unhinged: new address[](0),
        domain: CORRECT_DOMAIN,
        scope: CORRECT_SCOPE,
        skipBindCheck: true
      });

    stakingAssetHandler = new StakingAssetHandler(stakingAssetHandlerArgs);

    // Fund the contract with tokens
    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(stakingAssetHandler), faucetAmount * 10);
  }

  function setMockZKPassportVerifier() internal {
    stakingAssetHandler.setZKPassportVerifier(address(mockZKPassportVerifier));
  }

  function enableBindCheck() internal {
    stakingAssetHandler.setSkipBindCheck(false);
  }
}
