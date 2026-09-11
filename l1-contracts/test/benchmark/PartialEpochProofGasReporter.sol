// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupWithPreheating} from "../RollupWithPreheating.sol";

import {GenesisState, RollupConfigInput} from "@aztec/core/Rollup.sol";
import {
  IERC20,
  IFeeJuicePortal,
  IInbox,
  IOutbox,
  RollupConfig,
  SubmitEpochRootProofArgs
} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {EpochProofExtLib} from "@aztec/core/libraries/rollup/EpochProofExtLib.sol";
import {GSE} from "@aztec/governance/GSE.sol";

contract PartialEpochProofGasReporter is RollupWithPreheating {
  IOutbox private immutable ORIGINAL_OUTBOX;
  IFeeJuicePortal private immutable ORIGINAL_FEE_ASSET_PORTAL;
  IInbox private immutable ORIGINAL_INBOX;

  constructor(
    IERC20 _feeAsset,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config,
    IOutbox _originalOutbox,
    IFeeJuicePortal _originalFeeAssetPortal,
    IInbox _originalInbox
  ) RollupWithPreheating(_feeAsset, _stakingAsset, _gse, _epochProofVerifier, _governance, _genesisState, _config) {
    ORIGINAL_OUTBOX = _originalOutbox;
    ORIGINAL_FEE_ASSET_PORTAL = _originalFeeAssetPortal;
    ORIGINAL_INBOX = _originalInbox;
  }

  function _getRollupConfig() internal view override returns (RollupConfig memory config) {
    config = super._getRollupConfig();
    config.outbox = ORIGINAL_OUTBOX;
    config.feeAssetPortal = ORIGINAL_FEE_ASSET_PORTAL;
    // The etched runtime carries the reporter's own Inbox immutable, whose ROLLUP is the reporter's deployment
    // address; the proven-consumption callback would be rejected by it. Point the config at the Inbox the live
    // Rollup created, which the fixture's proposals were validated against.
    config.inbox = ORIGINAL_INBOX;
  }

  /**
   * Reports submission gas for a fresh one-checkpoint epoch prefix.
   */
  function gasReportSubmit1Checkpoint(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRollupConfig());
  }

  /**
   * Reports submission gas for a fresh eight-checkpoint epoch prefix.
   */
  function gasReportSubmit8Checkpoints(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRollupConfig());
  }

  /**
   * Reports submission gas for checkpoints nine through sixteen after an eight-checkpoint prefix.
   */
  function gasReportSubmit8MoreCheckpoints(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRollupConfig());
  }

  /**
   * Reports submission gas for a fresh sixteen-checkpoint epoch prefix.
   */
  function gasReportSubmit16Checkpoints(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRollupConfig());
  }

  /**
   * Reports submission gas for a complete thirty-two-checkpoint epoch.
   */
  function gasReportSubmit32Checkpoints(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofExtLib.submitEpochRootProof(_args, _getRollupConfig());
  }
}
