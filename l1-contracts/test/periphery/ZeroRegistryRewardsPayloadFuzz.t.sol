// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {RegistryReductionCalculator} from "@aztec/periphery/RegistryReductionCalculator.sol";
import {ZeroRegistryRewardsPayload} from "@aztec/periphery/ZeroRegistryRewardsPayload.sol";
import {StubGSE, StubRollup} from "./ZeroRegistryRewardsPayload.t.sol";

/**
 * @notice The unit suite checks the payload on two fixed registries. These run the same properties over lists of
 *         any length and any position: a zero address or a repeated entry anywhere is refused, every accepted list
 *         is reproduced action for action, executing the actions configures exactly the listed registries, and the
 *         calculator belongs to whoever owns the rollup.
 */
contract ZeroRegistryRewardsPayloadFuzzTest is Test {
  uint256 internal constant MAX_LIST = 64;

  address internal governance = makeAddr("governance");
  StubGSE internal gse;
  address internal rollup;

  function setUp() public {
    gse = new StubGSE();
    rollup = address(new StubRollup(governance, address(gse)));
  }

  /// @dev `_length` distinct, non-zero addresses derived from `_seed`.
  function _list(uint256 _seed, uint256 _length) internal pure returns (address[] memory list) {
    list = new address[](_length);
    for (uint256 i = 0; i < _length; i++) {
      // The index in the low bits keeps entries distinct whatever the seed, and bit 31 keeps them non-zero.
      list[i] = address(uint160(uint256(keccak256(abi.encode(_seed, i))) << 32 | (1 << 31) | i));
    }
  }

  function _contains(address[] memory _haystack, address _needle) internal pure returns (bool) {
    for (uint256 i = 0; i < _haystack.length; i++) {
      if (_haystack[i] == _needle) {
        return true;
      }
    }
    return false;
  }

  function test_FuzzRejectsARepeatedEntryAnywhere(uint256 _seed, uint256 _length, uint256 _first, uint256 _second)
    external
  {
    _length = bound(_length, 2, MAX_LIST);
    _first = bound(_first, 0, _length - 2);
    _second = bound(_second, _first + 1, _length - 1);
    address[] memory list = _list(_seed, _length);
    list[_second] = list[_first];

    vm.expectRevert(
      abi.encodeWithSelector(
        ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__DuplicateRegistry.selector, list[_first]
      )
    );
    new ZeroRegistryRewardsPayload(IInstance(rollup), list);
  }

  function test_FuzzRejectsTheZeroAddressAnywhere(uint256 _seed, uint256 _length, uint256 _at) external {
    _length = bound(_length, 1, MAX_LIST);
    _at = bound(_at, 0, _length - 1);
    address[] memory list = _list(_seed, _length);
    list[_at] = address(0);

    vm.expectRevert(ZeroRegistryRewardsPayload.ZeroRegistryRewardsPayload__ZeroAddress.selector);
    new ZeroRegistryRewardsPayload(IInstance(rollup), list);
  }

  /// @notice Any accepted list is stored as given and turns into one zeroing action per entry, in order, then the
  ///         install. No action targets anything but the payload's own calculator and the rollup.
  function test_FuzzActionsReproduceTheList(uint256 _seed, uint256 _length) external {
    _length = bound(_length, 1, MAX_LIST);
    address[] memory list = _list(_seed, _length);
    ZeroRegistryRewardsPayload payload = new ZeroRegistryRewardsPayload(IInstance(rollup), list);
    address calc = address(payload.CALCULATOR());

    assertEq(payload.registryCount(), _length, "registry count");
    IPayload.Action[] memory actions = payload.getActions();
    assertEq(actions.length, _length + 1, "n registries must give n + 1 actions");

    for (uint256 i = 0; i < _length; i++) {
      assertEq(payload.registries(i), list[i], "registry stored out of order");
      assertEq(actions[i].target, calc, "a zeroing action targets something other than the calculator");
      assertEq(
        actions[i].data,
        abi.encodeCall(RegistryReductionCalculator.setRegistryReward, (list[i], 0)),
        "a zeroing action does not zero its registry"
      );
    }
    assertEq(actions[_length].target, rollup, "last action must target the rollup");
    assertEq(
      actions[_length].data,
      abi.encodeCall(IRollupCore.setSequencerRewardCalculator, (calc)),
      "last action must install the payload's calculator"
    );
  }

  /// @notice Executed by governance, the actions leave exactly the listed registries configured, each at zero, and
  ///         any other registry without an entry.
  function test_FuzzExecutionConfiguresExactlyTheList(uint256 _seed, uint256 _length, address _other) external {
    _length = bound(_length, 1, MAX_LIST);
    address[] memory list = _list(_seed, _length);
    vm.assume(!_contains(list, _other));
    ZeroRegistryRewardsPayload payload = new ZeroRegistryRewardsPayload(IInstance(rollup), list);
    RegistryReductionCalculator calc = payload.CALCULATOR();

    vm.mockCall(rollup, abi.encodeWithSelector(IRollupCore.setSequencerRewardCalculator.selector), "");
    IPayload.Action[] memory actions = payload.getActions();
    for (uint256 i = 0; i < actions.length; i++) {
      vm.prank(governance);
      (bool ok,) = actions[i].target.call(actions[i].data);
      assertTrue(ok, "action reverted");
    }

    for (uint256 i = 0; i < _length; i++) {
      (bool exists, uint96 reward) = calc.getRegistryReward(list[i]);
      assertTrue(exists, "a listed registry was not configured");
      assertEq(reward, 0, "a listed registry must earn nothing");
    }
    (bool otherExists,) = calc.getRegistryReward(_other);
    assertFalse(otherExists, "an unlisted registry was configured");
  }

  /// @notice Whoever owns the rollup owns the calculator, and the deployer of the payload cannot configure it.
  function test_FuzzTheCalculatorBelongsToTheRollupOwner(address _owner, address _deployer, uint256 _seed) external {
    vm.assume(_owner != address(0) && _deployer != _owner);
    address ownedRollup = address(new StubRollup(_owner, address(gse)));

    vm.prank(_deployer);
    ZeroRegistryRewardsPayload payload = new ZeroRegistryRewardsPayload(IInstance(ownedRollup), _list(_seed, 1));
    RegistryReductionCalculator calc = payload.CALCULATOR();
    assertEq(calc.owner(), _owner, "calculator owner must be the rollup's owner");

    vm.prank(_deployer);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _deployer));
    calc.setRegistryReward(address(uint160(_seed) | 1), 1);
  }
}
