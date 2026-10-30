// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {RegistryReductionCalculator} from "@aztec/periphery/RegistryReductionCalculator.sol";
import {ZeroRegistryRewardsPayload} from "@aztec/periphery/ZeroRegistryRewardsPayload.sol";

/// @notice Enough of a GSE for the calculator's constructor, which only requires code at the address.
contract StubGSE {
  function getWithdrawer(address) external pure returns (address) {
    return address(0);
  }
}

/// @notice Enough of a rollup for the payload's constructor, which reads the owner and the GSE from it.
contract StubRollup {
  address public owner;
  address public getGSE;

  constructor(address _owner, address _gse) {
    owner = _owner;
    getGSE = _gse;
  }
}

contract ZeroRegistryRewardsPayloadTest is Test {
  /// @dev The registries this proposal zeroes.
  address internal constant LISTED_A = 0x667d2641cb96734f386adA6A9afCF07B1815fB8b;
  address internal constant LISTED_B = 0xD938bE4A2cB41105Bc2FbE707dca124A2e5d0c80;
  /// @dev Registries that must keep the default reward. The first holds the great majority of ATPs on mainnet.
  address internal constant UNLISTED_A = 0x63841bAD6B35b6419e15cA9bBBbDf446D4dC3dde;
  address internal constant UNLISTED_B = 0x8F778768aDed86AB778a47cd81b3b42B4b3F655B;

  address internal rollup;
  address internal governance = makeAddr("governance");
  StubGSE internal gse;
  ZeroRegistryRewardsPayload internal payload;

  function _listed() internal pure returns (address[] memory listed) {
    listed = new address[](2);
    listed[0] = LISTED_A;
    listed[1] = LISTED_B;
  }

  function setUp() public {
    gse = new StubGSE();
    rollup = address(new StubRollup(governance, address(gse)));
    payload = new ZeroRegistryRewardsPayload(IInstance(rollup), _listed());
  }

  function test_deploysACalculatorGovernanceAlreadyOwns() public view {
    // Ownership is not transferred later; the configuring actions are the owner's own.
    assertEq(payload.CALCULATOR().owner(), governance, "calculator must be governance-owned from birth");
    assertEq(address(payload.CALCULATOR().GSE()), address(gse), "calculator bound to the wrong GSE");
  }

  /// @notice The deployer never owns the calculator, so it cannot write entries the list does not show and then
  ///         hand the calculator to governance before the vote.
  function test_theDeployerCannotPreloadEntries() public {
    address author = makeAddr("author");
    vm.prank(author);
    ZeroRegistryRewardsPayload p = new ZeroRegistryRewardsPayload(IInstance(rollup), _listed());
    RegistryReductionCalculator calc = p.CALCULATOR();

    assertEq(calc.owner(), governance, "the deployer chose the calculator's owner");

    vm.prank(author);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, author));
    calc.setRegistryReward(UNLISTED_A, 0);
  }

  function test_theCalculatorFollowsTheRollup() public {
    address otherOwner = makeAddr("otherOwner");
    StubGSE otherGse = new StubGSE();
    StubRollup other = new StubRollup(otherOwner, address(otherGse));

    ZeroRegistryRewardsPayload p = new ZeroRegistryRewardsPayload(IInstance(address(other)), _listed());

    assertEq(p.CALCULATOR().owner(), otherOwner, "calculator owner must be the rollup's owner");
    assertEq(address(p.CALCULATOR().GSE()), address(otherGse), "calculator must resolve against the rollup's GSE");
  }

  function test_theCalculatorStartsWithNoEntries() public view {
    // Until the actions run it is inert: every proposer earns the default.
    (bool exists,) = payload.CALCULATOR().getRegistryReward(LISTED_A);
    assertFalse(exists, "configured before the vote");
  }

  function test_oneActionPerRegistryThenTheInstall() public view {
    IPayload.Action[] memory actions = payload.getActions();
    assertEq(actions.length, payload.registryCount() + 1, "one action per registry, plus the install");

    RegistryReductionCalculator calc = payload.CALCULATOR();

    assertEq(actions[0].target, address(calc));
    assertEq(
      actions[0].data,
      abi.encodeCall(RegistryReductionCalculator.setRegistryReward, (LISTED_A, 0)),
      "first action must zero the first listed registry"
    );

    assertEq(actions[1].target, address(calc));
    assertEq(
      actions[1].data,
      abi.encodeCall(RegistryReductionCalculator.setRegistryReward, (LISTED_B, 0)),
      "second action must zero the second listed registry"
    );

    assertEq(actions[2].target, rollup, "last action must target the rollup");
    assertEq(
      actions[2].data,
      abi.encodeCall(IRollupCore.setSequencerRewardCalculator, (address(calc))),
      "last action must install the calculator this payload deployed"
    );
  }

  /// @notice Executing the proposal leaves exactly the listed registries configured, at zero.
  function test_executingTheActionsZeroesOnlyTheListedRegistries() public {
    IPayload.Action[] memory actions = payload.getActions();
    RegistryReductionCalculator calc = payload.CALCULATOR();

    // Governance executes; the rollup call is mocked, it is not the subject here.
    vm.mockCall(rollup, abi.encodeWithSelector(IRollupCore.setSequencerRewardCalculator.selector), "");
    for (uint256 i = 0; i < actions.length; i++) {
      vm.prank(governance);
      (bool ok,) = actions[i].target.call(actions[i].data);
      assertTrue(ok, "action reverted");
    }

    (bool exists, uint96 reward) = calc.getRegistryReward(LISTED_A);
    assertTrue(exists);
    assertEq(reward, 0, "a listed registry must earn nothing");
    (exists, reward) = calc.getRegistryReward(LISTED_B);
    assertTrue(exists);
    assertEq(reward, 0, "a listed registry must earn nothing");

    // Every registry not on the list must have no entry at all.
    (exists,) = calc.getRegistryReward(UNLISTED_A);
    assertFalse(exists, "an unlisted registry was configured");
    (exists,) = calc.getRegistryReward(UNLISTED_B);
    assertFalse(exists, "an unlisted registry was configured");
  }

  function test_onlyGovernanceCanConfigureTheCalculator() public {
    IPayload.Action[] memory actions = payload.getActions();
    vm.prank(makeAddr("anyone"));
    (bool ok,) = actions[0].target.call(actions[0].data);
    assertFalse(ok, "a non-owner configured the calculator");
  }

  function test_constructorRejectsDegenerateConfigurations() public {
    address[] memory listed = _listed();

    vm.expectRevert(ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__ZeroAddress.selector);
    new ZeroRegistryRewardsPayload(IInstance(address(0)), listed);

    // An account without code cannot answer for its owner or GSE, so the payload cannot install on it.
    vm.expectRevert();
    new ZeroRegistryRewardsPayload(IInstance(makeAddr("eoa")), listed);

    vm.expectRevert(ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__NoRegistries.selector);
    new ZeroRegistryRewardsPayload(IInstance(rollup), new address[](0));

    address[] memory withZero = new address[](1);
    vm.expectRevert(ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__ZeroAddress.selector);
    new ZeroRegistryRewardsPayload(IInstance(rollup), withZero);

    address[] memory dup = new address[](2);
    dup[0] = LISTED_A;
    dup[1] = LISTED_A;
    vm.expectRevert(
      abi.encodeWithSelector(
        ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__DuplicateRegistry.selector, LISTED_A
      )
    );
    new ZeroRegistryRewardsPayload(IInstance(rollup), dup);
  }

  function test_scalesToAnyNumberOfRegistries() public {
    address[] memory many = new address[](5);
    for (uint256 i = 0; i < 5; i++) {
      many[i] = address(uint160(0xAB00 + i));
    }
    ZeroRegistryRewardsPayload p = new ZeroRegistryRewardsPayload(IInstance(rollup), many);
    assertEq(p.getActions().length, 6, "n registries must give n + 1 actions");
  }
}
