// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {ZKPassportBase} from "./zkpassport/ZKPassportBase.sol";

// solhint-disable comprehensive-interface

contract StakingAssetHandlerBase is ZKPassportBase, TestBase {
  IStaking internal staking;
  TestERC20 internal stakingAsset;
  Registry internal registry;
  StakingAssetHandler internal stakingAssetHandler;

  address internal constant PROPOSER = address(bytes20("PROPOSER"));
  address internal constant ATTESTER = address(bytes20("ATTESTER"));
  address internal constant WITHDRAWER = address(bytes20("WITHDRAWER"));
  address internal constant RECIPIENT = address(bytes20("RECIPIENT"));

  uint256 internal MINIMUM_STAKE;
  bytes internal EMPTY_PROOF = bytes(string(""));
  bytes32[] internal EMPTY_PUBLIC_INPUTS = new bytes32[](0);

  uint256 internal mintInterval = 1;
  uint256 internal depositsPerMint = 1;

  function setUp() public virtual {
    RollupBuilder builder = new RollupBuilder(address(this));

    builder.deploy();

    stakingAsset = builder.getConfig().testERC20;
    registry = builder.getConfig().registry;
    MINIMUM_STAKE = builder.getConfig().rollup.getMinimumStake();
    staking = IStaking(address(builder.getConfig().rollup));

    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      registry,
      WITHDRAWER,
      mintInterval,
      depositsPerMint,
      zkPassportVerifier,
      new address[](0),
      CORRECT_SCOPE,
      CORRECT_SUBSCOPE,
      true
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
  }

  function setMockZKPassportVerifier() internal {
    stakingAssetHandler.setZKPassportVerifier(address(mockZKPassportVerifier));
  }

  function enableBindCheck() internal {
    stakingAssetHandler.setSkipBindCheck(false);
  }
}
