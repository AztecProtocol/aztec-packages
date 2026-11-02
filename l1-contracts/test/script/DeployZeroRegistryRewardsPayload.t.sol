// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {DeployZeroRegistryRewardsPayload} from "../../script/deploy/DeployZeroRegistryRewardsPayload.s.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {ZeroRegistryRewardsPayload} from "@aztec/periphery/ZeroRegistryRewardsPayload.sol";

/// @dev The deploy script with the registry supplied directly and the governance simulation stubbed out.
contract ZeroRegistryRewardsHarness is DeployZeroRegistryRewardsPayload {
  address public registry;

  constructor(address _registry) {
    registry = _registry;
  }

  function setRegistry(address _registry) external {
    registry = _registry;
  }

  function _registry() internal view override returns (Registry) {
    return Registry(registry);
  }

  /// @dev The simulation needs forked state with real stake behind the canonical rollup, which these stubs do not
  ///      have. It runs on deploy day against a fork.
  function _simulate(address) internal override {}
}

/// @notice Enough of a GSE for the calculator's constructor, which only requires code at the address.
contract StubGSE {
  function getWithdrawer(address) external pure returns (address) {
    return address(0);
  }
}

/// @notice Enough of a rollup for the script: its owner, its GSE and the calculator getter.
contract StubRollup {
  address public owner;
  address public getGSE;
  address public getSequencerRewardCalculator;

  constructor(address _owner, address _gse) {
    owner = _owner;
    getGSE = _gse;
  }
}

/// @notice A rollup without sequencer reward calculator support.
contract StubRollupWithoutCalculator {
  address public owner;
  address public getGSE;

  constructor(address _owner, address _gse) {
    owner = _owner;
    getGSE = _gse;
  }
}

/// @notice Enough of a registry for the script: the canonical rollup and governance.
contract StubRegistry {
  address public getCanonicalRollup;
  address public getGovernance;

  constructor(address _rollup, address _governance) {
    getCanonicalRollup = _rollup;
    getGovernance = _governance;
  }
}

contract DeployZeroRegistryRewardsPayloadTest is Test {
  uint256 internal constant MAINNET_CHAIN_ID = 1;
  uint256 internal constant SEPOLIA_CHAIN_ID = 11_155_111;

  address internal constant LISTED_A = 0x667d2641cb96734f386adA6A9afCF07B1815fB8b;
  address internal constant LISTED_B = 0xD938bE4A2cB41105Bc2FbE707dca124A2e5d0c80;

  address internal governance = makeAddr("governance");
  StubGSE internal gse;
  StubRollup internal rollup;
  address internal registry;

  function setUp() public {
    gse = new StubGSE();
    rollup = new StubRollup(governance, address(gse));
    registry = address(new StubRegistry(address(rollup), governance));
  }

  function test_MainnetDeploysAndVerifies() public {
    vm.chainId(MAINNET_CHAIN_ID);
    ZeroRegistryRewardsHarness harness = new ZeroRegistryRewardsHarness(registry);
    harness.run();

    ZeroRegistryRewardsPayload payload = harness.deployedPayload();
    assertEq(address(payload.ROLLUP()), address(rollup), "payload targets the wrong rollup");
    assertEq(payload.registryCount(), 2, "registry count");
    assertEq(payload.registries(0), LISTED_A, "first registry");
    assertEq(payload.registries(1), LISTED_B, "second registry");
    assertEq(payload.CALCULATOR().owner(), governance, "calculator owner");

    // `run()` already calls it, but calling it again pins that it works stand-alone on a deployed payload.
    harness.verify(address(payload));
  }

  function test_UnsupportedChainReverts() public {
    vm.chainId(SEPOLIA_CHAIN_ID);
    ZeroRegistryRewardsHarness harness = new ZeroRegistryRewardsHarness(registry);
    vm.expectRevert(
      abi.encodeWithSelector(
        DeployZeroRegistryRewardsPayload.DeployZeroRegistryRewardsPayload__UnsupportedChain.selector, SEPOLIA_CHAIN_ID
      )
    );
    harness.run();
  }

  function test_RollupNotOwnedByGovernanceReverts() public {
    vm.chainId(MAINNET_CHAIN_ID);
    StubRollup other = new StubRollup(makeAddr("someoneElse"), address(gse));
    ZeroRegistryRewardsHarness harness =
      new ZeroRegistryRewardsHarness(address(new StubRegistry(address(other), governance)));
    vm.expectRevert();
    harness.run();
  }

  function test_RollupWithoutCalculatorSupportReverts() public {
    vm.chainId(MAINNET_CHAIN_ID);
    StubRollupWithoutCalculator old = new StubRollupWithoutCalculator(governance, address(gse));
    ZeroRegistryRewardsHarness harness =
      new ZeroRegistryRewardsHarness(address(new StubRegistry(address(old), governance)));
    vm.expectRevert();
    harness.run();
  }

  function test_VerifyRejectsAPayloadWithADifferentList() public {
    vm.chainId(MAINNET_CHAIN_ID);
    address[] memory registries = new address[](1);
    registries[0] = LISTED_A;
    ZeroRegistryRewardsPayload shorter = new ZeroRegistryRewardsPayload(IInstance(address(rollup)), registries);

    ZeroRegistryRewardsHarness harness = new ZeroRegistryRewardsHarness(registry);
    vm.expectRevert();
    harness.verify(address(shorter));
  }

  function test_VerifyRejectsAPayloadForANonCanonicalRollup() public {
    vm.chainId(MAINNET_CHAIN_ID);
    ZeroRegistryRewardsHarness harness = new ZeroRegistryRewardsHarness(registry);
    harness.run();
    ZeroRegistryRewardsPayload payload = harness.deployedPayload();

    harness.setRegistry(address(new StubRegistry(address(new StubRollup(governance, address(gse))), governance)));
    vm.expectRevert();
    harness.verify(address(payload));
  }
}
