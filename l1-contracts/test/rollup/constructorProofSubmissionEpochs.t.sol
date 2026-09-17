// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;
// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {GenesisState} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {RollupBuilder, Config as BuilderConfig} from "@test/builder/RollupBuilder.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Verifies that it is impossible to set aztecProofSubmissionEpochs to zero
///         since this would cause painful edgecase effects. For example, proof submissions
///         could never update prover activity scores
contract ConstructorProofSubmissionEpochsTest is Test {
  RollupBuilder internal builder;
  TestERC20 internal token;
  GSE internal gse;
  GenesisState internal genesisState;
  IVerifier internal verifier;

  function test_revertsWhenProofSubmissionEpochIsZero() external {
    RollupConfigInput memory config = _buildDefaultConfig();
    config.aztecProofSubmissionEpochs = 0;

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidProofSubmissionEpochs.selector, 1, 0));

    new Rollup(token, token, gse, verifier, address(this), genesisState, config);
  }

  function test_succeedsWithOneProofSubmissionEpoch() external {
    RollupConfigInput memory config = _buildDefaultConfig();
    config.aztecProofSubmissionEpochs = 1;

    Rollup rollup = new Rollup(token, token, gse, verifier, address(this), genesisState, config);

    assertEq(rollup.getProofSubmissionEpochs(), 1);
  }

  function setUp() public {
    builder = new RollupBuilder(address(this));
    builder.deploy();

    BuilderConfig memory cfg = builder.getConfig();
    token = cfg.testERC20;
    gse = cfg.gse;
    genesisState = cfg.genesisState;
    verifier = new MockVerifier();
  }

  function _buildDefaultConfig() internal view returns (RollupConfigInput memory) {
    return builder.getConfig().rollupConfigInput;
  }
}
