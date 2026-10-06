// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {V6UpgradePayload} from "@aztec/periphery/V6UpgradePayload.sol";

/// @dev Enough of a rollup for the payload's constructor and action list: a GSE to point at.
contract ForkStandInRollup {
  address internal immutable GSE_;

  constructor(address _gse) {
    GSE_ = _gse;
  }

  function getGSE() external view returns (GSE) {
    return GSE(GSE_);
  }
}

/// @dev The payload only reads `getRollup()` off the hatch.
contract ForkStandInEscapeHatch {
  address internal immutable ROLLUP_;

  constructor(address _rollup) {
    ROLLUP_ = _rollup;
  }

  function getRollup() external view returns (address) {
    return ROLLUP_;
  }
}

/**
 * @notice Checks the v6 payload's proof-of-possession gas cap action against the live mainnet GSE:
 *         that governance owns the GSE, so the action can execute, and that the encoded call sets
 *         the cap when governance makes it.
 * @dev Skipped unless `MAINNET_FORK_RPC_URL` is set, so it never runs in CI. Forks the latest block:
 *      what matters is who owns the GSE when the payload executes, not at some pinned block.
 *        MAINNET_FORK_RPC_URL=<mainnet rpc> forge test --match-path test/fork/MainnetV6PopGasLimit.t.sol
 */
contract MainnetV6PopGasLimitTest is Test {
  string internal constant MAINNET_RPC_URL_ENV = "MAINNET_FORK_RPC_URL";

  IRegistry internal constant MAINNET_REGISTRY = IRegistry(0x35b22e09Ee0390539439E24f06Da43D83f90e298);
  address internal constant MAINNET_GSE = 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f;

  uint64 internal constant POP_GAS_LIMIT = 300_000;

  function setUp() public {
    string memory rpcUrl = vm.envOr(MAINNET_RPC_URL_ENV, string(""));
    if (bytes(rpcUrl).length == 0) {
      vm.skip(true);
      return;
    }
    vm.createSelectFork(rpcUrl);
  }

  function test_LiveGseIsOwnedByGovernance() public view {
    address canonical = address(MAINNET_REGISTRY.getCanonicalRollup());
    assertEq(address(IInstance(canonical).getGSE()), MAINNET_GSE, "canonical rollup uses another GSE");
    assertEq(GSE(MAINNET_GSE).owner(), MAINNET_REGISTRY.getGovernance(), "GSE owner is not governance");
  }

  function test_PayloadActionRaisesTheLiveCap() public {
    GSE gse = GSE(MAINNET_GSE);
    assertLt(gse.proofOfPossessionGasLimit(), POP_GAS_LIMIT, "live cap is already at or above the target");

    address incoming = address(new ForkStandInRollup(MAINNET_GSE));
    V6UpgradePayload payload = new V6UpgradePayload(
      MAINNET_REGISTRY,
      IInstance(incoming),
      IEscapeHatch(address(new ForkStandInEscapeHatch(incoming))),
      FlushRewarder(address(0)),
      false,
      0,
      false,
      0,
      0,
      POP_GAS_LIMIT
    );

    IPayload.Action[] memory actions = payload.getActions();
    IPayload.Action memory raise = actions[actions.length - 1];
    assertEq(raise.target, MAINNET_GSE, "cap action does not target the live GSE");

    // Executed alone, as governance would execute it: the other actions need a real v6 rollup.
    vm.prank(MAINNET_REGISTRY.getGovernance());
    (bool ok,) = raise.target.call(raise.data);
    assertTrue(ok, "governance could not set the cap");
    assertEq(gse.proofOfPossessionGasLimit(), POP_GAS_LIMIT, "cap not raised");
  }
}
