// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {RegistryReductionCalculator} from "@aztec/periphery/RegistryReductionCalculator.sol";
import {ZeroRegistryRewardsPayload} from "@aztec/periphery/ZeroRegistryRewardsPayload.sol";
import {StubGSE, StubRollup} from "./ZeroRegistryRewardsPayload.t.sol";

/**
 * @notice Drives the payload's calculator through random sequences of calls by accounts other than governance
 *         (writing, removing, transferring and renouncing), interleaved with the one execution of the payload's
 *         actions by governance.
 */
contract ZeroRegistryRewardsPayloadHandler is Test {
  ZeroRegistryRewardsPayload internal immutable PAYLOAD;
  RegistryReductionCalculator internal immutable CALCULATOR;
  address internal immutable ROLLUP;
  address internal immutable GOVERNANCE;

  bool public executed;
  mapping(bytes32 action => uint256 count) public calls;

  constructor(ZeroRegistryRewardsPayload _payload, address _rollup, address _governance) {
    PAYLOAD = _payload;
    CALCULATOR = _payload.CALCULATOR();
    ROLLUP = _rollup;
    GOVERNANCE = _governance;
  }

  function _notGovernance(address _caller) internal view returns (address) {
    return _caller == GOVERNANCE ? address(uint160(_caller) ^ 1) : _caller;
  }

  function strangerSets(address _caller, address _registry, uint96 _reward) external {
    calls["strangerSets"]++;
    vm.prank(_notGovernance(_caller));
    try CALCULATOR.setRegistryReward(_registry, _reward) {} catch {}
  }

  function strangerRemoves(address _caller, uint256 _index) external {
    calls["strangerRemoves"]++;
    address registry = PAYLOAD.registries(bound(_index, 0, PAYLOAD.registryCount() - 1));
    vm.prank(_notGovernance(_caller));
    try CALCULATOR.removeRegistryReward(registry) {} catch {}
  }

  function strangerTransfers(address _caller, address _to) external {
    calls["strangerTransfers"]++;
    vm.prank(_notGovernance(_caller));
    try CALCULATOR.transferOwnership(_to) {} catch {}
  }

  function strangerRenounces(address _caller) external {
    calls["strangerRenounces"]++;
    vm.prank(_notGovernance(_caller));
    try CALCULATOR.renounceOwnership() {} catch {}
  }

  /// @notice Governance executes the proposal once, as `Governance.execute` would: every action must succeed.
  function governanceExecutes() external {
    if (executed) {
      return;
    }
    calls["governanceExecutes"]++;
    vm.mockCall(ROLLUP, abi.encodeWithSelector(IRollupCore.setSequencerRewardCalculator.selector), "");
    IPayload.Action[] memory actions = PAYLOAD.getActions();
    for (uint256 i = 0; i < actions.length; i++) {
      vm.prank(GOVERNANCE);
      (bool ok,) = actions[i].target.call(actions[i].data);
      require(ok, "action reverted");
    }
    executed = true;
  }
}

contract ZeroRegistryRewardsPayloadInvariantTest is Test {
  address internal governance = makeAddr("governance");
  address internal rollup;
  ZeroRegistryRewardsPayload internal payload;
  ZeroRegistryRewardsPayloadHandler internal handler;
  bytes32 internal actionsHash;
  uint256 internal registryCount;

  function setUp() public {
    rollup = address(new StubRollup(governance, address(new StubGSE())));
    address[] memory list = new address[](3);
    list[0] = 0x667d2641cb96734f386adA6A9afCF07B1815fB8b;
    list[1] = 0xD938bE4A2cB41105Bc2FbE707dca124A2e5d0c80;
    list[2] = makeAddr("third registry");
    payload = new ZeroRegistryRewardsPayload(IInstance(rollup), list);
    registryCount = list.length;
    actionsHash = keccak256(abi.encode(payload.getActions()));

    handler = new ZeroRegistryRewardsPayloadHandler(payload, rollup, governance);
    targetContract(address(handler));
  }

  /// @notice No sequence of calls by anyone but governance moves the calculator's ownership.
  function invariant_theCalculatorStaysWithGovernance() external view {
    assertEq(payload.CALCULATOR().owner(), governance, "calculator ownership moved");
  }

  /// @notice What voters approve cannot change after deployment: the list and the actions are fixed.
  function invariant_theProposalIsFixed() external view {
    assertEq(payload.registryCount(), registryCount, "registry count changed");
    assertEq(keccak256(abi.encode(payload.getActions())), actionsHash, "actions changed");
  }

  /// @notice Before execution no listed registry has an entry; after it every listed registry is at zero. Calls by
  ///         anyone else change neither.
  function invariant_listedRegistriesAreUntouchedOrZero() external view {
    RegistryReductionCalculator calc = payload.CALCULATOR();
    for (uint256 i = 0; i < registryCount; i++) {
      (bool exists, uint96 reward) = calc.getRegistryReward(payload.registries(i));
      if (handler.executed()) {
        assertTrue(exists, "a listed registry has no entry after execution");
        assertEq(reward, 0, "a listed registry earns something");
      } else {
        assertFalse(exists, "a listed registry was configured before execution");
      }
    }
  }
}
