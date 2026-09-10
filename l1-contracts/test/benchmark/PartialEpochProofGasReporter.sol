// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupWithPreheating} from "../RollupWithPreheating.sol";

import {GenesisState, RollupConfigInput} from "@aztec/core/Rollup.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IERC20, RollupConfig, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {EpochProofExtLib} from "@aztec/core/libraries/rollup/EpochProofExtLib.sol";
import {GSE} from "@aztec/governance/GSE.sol";

contract PartialEpochProofGasReporter is RollupWithPreheating {
  // This contract's runtime code is etched onto a live Rollup and runs against that rollup's storage, but a
  // rollup's config lives in its immutables, which are part of the code. The Inbox and Outbox this constructor
  // deploys would therefore travel with the etched code and displace the live rollup's, so the live ones are
  // passed in and substituted back below.
  IInbox private immutable LIVE_INBOX;
  IOutbox private immutable LIVE_OUTBOX;
  IFeeJuicePortal private immutable LIVE_FEE_ASSET_PORTAL;

  constructor(
    IERC20 _feeAsset,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config,
    IInbox _liveInbox,
    IOutbox _liveOutbox
  ) RollupWithPreheating(_feeAsset, _stakingAsset, _gse, _epochProofVerifier, _governance, _genesisState, _config) {
    LIVE_INBOX = _liveInbox;
    LIVE_OUTBOX = _liveOutbox;
    LIVE_FEE_ASSET_PORTAL = IFeeJuicePortal(_liveInbox.getFeeAssetPortal());
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

  function _getRollupConfig() internal view override returns (RollupConfig memory) {
    RollupConfig memory config = super._getRollupConfig();
    config.inbox = LIVE_INBOX;
    config.outbox = LIVE_OUTBOX;
    config.feeAssetPortal = LIVE_FEE_ASSET_PORTAL;
    return config;
  }
}
