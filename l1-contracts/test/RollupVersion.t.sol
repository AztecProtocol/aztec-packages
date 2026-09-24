// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable func-name-mixedcase
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {RollupBuilder} from "./builder/RollupBuilder.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";

contract RollupVersionTest is Test {
  function test_versionIsDerivedFromChainIdAddressConfigAndGenesis() external {
    RollupBuilder builder = new RollupBuilder(address(this)).deploy();
    Rollup rollup = Rollup(address(builder.getConfig().rollup));

    uint256 expected = uint32(
      bytes4(
        keccak256(
          abi.encode(
            block.chainid, address(rollup), builder.getConfig().rollupConfigInput, builder.getConfig().genesisState
          )
        )
      )
    );
    assertEq(rollup.getVersion(), expected, "version");
    assertEq(Inbox(address(rollup.getInbox())).VERSION(), expected, "inbox version");
    assertEq(Outbox(address(rollup.getOutbox())).VERSION(), expected, "outbox version");
  }

  function test_identicallyConfiguredRollupsHaveDistinctVersions() external {
    RollupBuilder first = new RollupBuilder(address(this)).deploy();
    Registry registry = first.getConfig().registry;
    Rollup firstRollup = Rollup(address(first.getConfig().rollup));

    // Same registry, GSE, assets, genesis state and rollup config as the first rollup.
    RollupBuilder second = new RollupBuilder(address(this)).setGSE(first.getConfig().gse)
      .setTestERC20(first.getConfig().testERC20).setRegistry(registry).setMakeCanonical(false).setMakeGovernance(false)
      .setUpdateOwnerships(false).deploy();
    Rollup secondRollup = Rollup(address(second.getConfig().rollup));

    assertNotEq(firstRollup.getVersion(), secondRollup.getVersion(), "versions collide");

    // Both can be registered side by side, since the Registry is keyed by version.
    vm.prank(registry.owner());
    registry.addRollup(IHaveVersion(address(secondRollup)));
    assertEq(address(registry.getRollup(firstRollup.getVersion())), address(firstRollup), "first rollup");
    assertEq(address(registry.getRollup(secondRollup.getVersion())), address(secondRollup), "second rollup");
  }
}
