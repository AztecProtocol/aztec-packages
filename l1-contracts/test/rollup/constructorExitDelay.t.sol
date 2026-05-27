// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;
// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {RollupBuilder, Config as BuilderConfig} from "@test/builder/RollupBuilder.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {GenesisState} from "@aztec/core/libraries/rollup/STFLib.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";

/// @notice Verifies the Rollup constructor enforces exitDelaySeconds <= SLASHER_EXECUTION_DELAY.
///         queueSetSlasher schedules the replacement slasher to land after
///         SLASHER_EXECUTION_DELAY. A longer exit delay would leave an objecting validator
///         unable to finish withdrawal before the new slasher takes over, breaking the opt-out
///         window the rotation queue is meant to provide.
contract ConstructorExitDelayTest is Test {
  TestERC20 internal token;
  GSE internal gse;
  GenesisState internal genesisState;
  IVerifier internal verifier;

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();
    // Cache the deps locally so each test's expectRevert isn't consumed by intermediate
    // getConfig() calls when constructing the Rollup under test.
    BuilderConfig memory cfg = builder.getConfig();
    token = cfg.testERC20;
    gse = cfg.gse;
    genesisState = cfg.genesisState;
    verifier = new MockVerifier();
  }

  function _buildDefaultConfig(RollupBuilder _builder) internal view returns (RollupConfigInput memory) {
    return _builder.getConfig().rollupConfigInput;
  }

  function test_revertsWhenExitDelayAboveSlasherDelay(uint256 _excess) external {
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();

    uint256 excess = bound(_excess, 1, 365 days);
    uint256 badDelay = StakingLib.SLASHER_EXECUTION_DELAY + excess;

    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.exitDelaySeconds = badDelay;

    // Constructor is the call right after expectRevert; no intermediate getConfig() reads.
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__ExitDelayAboveSlasherDelay.selector, badDelay, StakingLib.SLASHER_EXECUTION_DELAY
      )
    );
    new Rollup(token, token, gse, verifier, address(this), genesisState, config);
  }

  function test_succeedsAtSlasherDelayBoundary() external {
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();

    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.exitDelaySeconds = StakingLib.SLASHER_EXECUTION_DELAY;

    Rollup rollup = new Rollup(token, token, gse, verifier, address(this), genesisState, config);
    assertTrue(address(rollup) != address(0), "constructor must accept exitDelay == slasherDelay");
  }
}
