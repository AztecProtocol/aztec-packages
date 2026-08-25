// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupWithPreheating} from "../RollupWithPreheating.sol";

import {GenesisState, RollupConfigInput} from "@aztec/core/Rollup.sol";
import {IERC20, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {EpochProofExtLib} from "@aztec/core/libraries/rollup/EpochProofExtLib.sol";
import {GSE} from "@aztec/governance/GSE.sol";

contract PartialEpochProofGasReporter is RollupWithPreheating {
  constructor(
    IERC20 _feeAsset,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config
  ) RollupWithPreheating(_feeAsset, _stakingAsset, _gse, _epochProofVerifier, _governance, _genesisState, _config) {}

  /**
   * Reports submission gas for a fresh one-checkpoint epoch prefix.
   */
  function gasReportSubmit1Checkpoint(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }

  /**
   * Reports submission gas for a fresh eight-checkpoint epoch prefix.
   */
  function gasReportSubmit8Checkpoints(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }

  /**
   * Reports submission gas for checkpoints nine through sixteen after an eight-checkpoint prefix.
   */
  function gasReportSubmit8MoreCheckpoints(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }

  /**
   * Reports submission gas for a fresh sixteen-checkpoint epoch prefix.
   */
  function gasReportSubmit16Checkpoints(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }

  /**
   * Reports submission gas for a complete thirty-two-checkpoint epoch.
   */
  function gasReportSubmit32Checkpoints(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }

  /**
   * Reports submission gas for a fresh one-checkpoint epoch prefix with two registry reward overrides.
   */
  function gasReportSubmit1CheckpointWithTwoOverrides(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }

  /**
   * Reports submission gas for a fresh eight-checkpoint epoch prefix with two registry reward overrides.
   */
  function gasReportSubmit8CheckpointsWithTwoOverrides(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }

  /**
   * Reports submission gas for a fresh sixteen-checkpoint epoch prefix with two registry reward overrides.
   */
  function gasReportSubmit16CheckpointsWithTwoOverrides(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }

  /**
   * Reports submission gas for a complete thirty-two-checkpoint epoch with two registry reward overrides.
   */
  function gasReportSubmit32CheckpointsWithTwoOverrides(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRegistryRewardOverrides());
  }
}
