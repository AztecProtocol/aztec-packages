// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test, StdUtils} from "forge-std/Test.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {RegistryReductionCalculator} from "@aztec/periphery/RegistryReductionCalculator.sol";
import {ZeroRegistryRewardsPayload} from "@aztec/periphery/ZeroRegistryRewardsPayload.sol";
import {Ownable} from "@oz/access/Ownable.sol";

contract InvariantRollupStub {
  address public owner;
  address public getGSE;
  address public sequencerRewardCalculator;

  constructor(address _owner, address _gse) {
    owner = _owner;
    getGSE = _gse;
  }

  function setSequencerRewardCalculator(address _calc) external {
    require(msg.sender == owner, "Rollup: not owner");
    sequencerRewardCalculator = _calc;
  }
}

contract InvariantGSEStub {
  function getWithdrawer(address) external pure returns (address) {
    return address(0);
  }
}

contract ZeroRegistryPayloadHandler is StdUtils {
  InvariantGSEStub public immutable gse;
  InvariantRollupStub public immutable rollup;
  address public immutable governance;
  ZeroRegistryRewardsPayload public payload;

  address[] internal _knownRegistries;
  bool public executed;

  constructor() {
    governance = makeAddr("governance");
    gse = new InvariantGSEStub();
    rollup = new InvariantRollupStub(governance, address(gse));
  }

  function setupPayload(uint8 rawN, uint256 seed) public {
    uint8 n = uint8(bound(rawN, 1, 50));
    address[] memory regs = new address[](n);
    for (uint8 i = 0; i < n; i++) {
      regs[i] = address(uint160(uint256(keccak256(abi.encode(seed, i))) % (type(uint160).max - 1) + 1));
      for (uint8 j = 0; j < i; j++) {
        if (regs[j] == regs[i]) regs[i] = address(uint160(regs[i]) + 1);
      }
    }
    payload = new ZeroRegistryRewardsPayload(IInstance(address(rollup)), regs);
    delete _knownRegistries;
    for (uint8 i = 0; i < n; i++) _knownRegistries.push(regs[i]);
    executed = false;
  }

  function executePayload() public {
    if (address(payload) == address(0)) return;
    IPayload.Action[] memory actions = payload.getActions();
    vm.startPrank(governance);
    for (uint256 i = 0; i < actions.length; i++) {
      (bool ok,) = actions[i].target.call(actions[i].data);
      require(ok, "action execution failed");
    }
    vm.stopPrank();
    executed = true;
  }

  function knownCount() external view returns (uint256) {
    return _knownRegistries.length;
  }

  function getKnownRegistry(uint256 i) external view returns (address) {
    return _knownRegistries[i];
  }
}

contract ZeroRegistryRewardsPayloadInvariant is Test {
  ZeroRegistryPayloadHandler internal handler;

  function setUp() public {
    handler = new ZeroRegistryPayloadHandler();
    handler.setupPayload(5, 42);

    targetContract(address(handler));
    bytes4[] memory selectors = new bytes4[](2);
    selectors[0] = ZeroRegistryPayloadHandler.setupPayload.selector;
    selectors[1] = ZeroRegistryPayloadHandler.executePayload.selector;
    targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
  }

  function invariant_ownershipImmutable() public view {
    ZeroRegistryRewardsPayload p = handler.payload();
    if (address(p) == address(0)) return;

    assertEq(p.CALCULATOR().owner(), handler.governance(), "I-5: calculator owner != governance");
  }

  function invariant_actionCountStable() public view {
    ZeroRegistryRewardsPayload p = handler.payload();
    if (address(p) == address(0)) return;

    assertEq(p.getActions().length, handler.knownCount() + 1, "action count mismatch");
  }

  function invariant_calculatorLinkedAfterExecute() public view {
    if (!handler.executed()) return;

    assertEq(
      handler.rollup().sequencerRewardCalculator(),
      address(handler.payload().CALCULATOR()),
      "calculator not linked after execute"
    );
  }

  function invariant_allRegistriesZeroedAfterExecute() public view {
    if (!handler.executed()) return;

    uint256 count = handler.knownCount();
    RegistryReductionCalculator calc = handler.payload().CALCULATOR();
    for (uint256 i = 0; i < count; i++) {
      address reg = handler.getKnownRegistry(i);
      (bool exists, uint96 reward) = calc.getRegistryReward(reg);
      assertTrue(exists, "registry must be configured in calculator");
      assertEq(reward, 0, "registry reward must be zeroed");
    }
  }
}
