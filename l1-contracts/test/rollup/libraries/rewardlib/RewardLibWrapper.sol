// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RewardLib, RewardConfig, RewardStorage} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {RewardBooster, IBoosterCore, RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {STFLib, RollupStore} from "@aztec/core/libraries/rollup/STFLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

import {TempCheckpointLog} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {FeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {CompressedChainTips, ChainTipsLib} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {FeeLib} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";

contract FakeFeePortal {
  IERC20 public feeAsset;

  constructor(IERC20 _feeAsset) {
    feeAsset = _feeAsset;
  }

  function distributeFees(address _to, uint256 _amount) external {
    feeAsset.transfer(_to, _amount);
  }
}

contract FakeRewardDistributor {
  address public canonicalRollup;
  IERC20 public feeAsset;

  constructor(IERC20 _feeAsset) {
    canonicalRollup = msg.sender;
    feeAsset = _feeAsset;
  }

  function claim(address _to, uint256 _amount) external {
    feeAsset.transfer(_to, _amount);
  }

  function nuke() external {
    canonicalRollup = address(0);
  }
}

contract RewardLibWrapper {
  using ChainTipsLib for CompressedChainTips;

  RewardBooster internal booster;
  Epoch internal currentEpoch;
  FakeRewardDistributor public rewardDistributor;
  FakeFeePortal public feePortal;

  constructor(IERC20 _feeAsset, uint96 _checkpointReward, uint32 _sequencerBps) {
    booster = new RewardBooster(
      IValidatorSelection(address(this)),
      RewardBoostConfig({increment: 125_000, maxScore: 15_000_000, a: 1000, minimum: 100_000, k: 1_000_000})
    );

    rewardDistributor = new FakeRewardDistributor(_feeAsset);
    feePortal = new FakeFeePortal(_feeAsset);
    RewardConfig memory config = RewardConfig({
      rewardDistributor: IRewardDistributor(address(rewardDistributor)),
      sequencerBps: Bps.wrap(_sequencerBps),
      booster: IBoosterCore(address(booster)),
      checkpointReward: _checkpointReward
    });

    RewardLib.setConfig(config);

    RollupStore storage rollupStore = STFLib.getStorage();
    rollupStore.config.feeAsset = _feeAsset;
    rollupStore.config.feeAssetPortal = IFeeJuicePortal(address(feePortal));

    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
  }

  function updateManaTarget(uint256 _manaLimit) external {
    FeeLib.updateManaTarget(_manaLimit);
  }

  function nukeRewardDistributor() external {
    FakeRewardDistributor(address(RewardLib.getStorage().config.rewardDistributor)).nuke();
  }

  function addFeeHeader(FeeHeader memory _feeHeader) external {
    // Increase the pending checkpoint number.
    RollupStore storage rollupStore = STFLib.getStorage();
    CompressedChainTips tips = rollupStore.tips;
    rollupStore.tips = tips.updatePending(tips.getPending() + 1);
    STFLib.addTempCheckpointLog(
      TempCheckpointLog({
        headerHash: bytes32(0),
        blobCommitmentsHash: bytes32(0),
        attestationsHash: bytes32(0),
        payloadDigest: bytes32(0),
        slotNumber: Slot.wrap(0),
        feeHeader: _feeHeader
      })
    );
  }

  function setCurrentEpoch(Epoch _epoch) external {
    currentEpoch = _epoch;
  }

  function handleRewardsAndFees(SubmitEpochRootProofArgs memory _args, Epoch _endEpoch) external {
    RewardLib.handleRewardsAndFees(_args, _endEpoch);
  }

  function getSequencerRewards(address _sequencer) external view returns (uint256) {
    return RewardLib.getSequencerRewards(_sequencer);
  }

  function getCollectiveProverRewardsForEpoch(Epoch _epoch) external view returns (uint256) {
    return RewardLib.getCollectiveProverRewardsForEpoch(_epoch);
  }

  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover) external view returns (bool) {
    return RewardLib.getHasSubmitted(_epoch, _length, _prover);
  }

  function getCurrentEpoch() external view returns (Epoch) {
    return currentEpoch;
  }

  function getLongestProvenLength(Epoch _epoch) external view returns (uint256) {
    return RewardLib.getStorage().epochRewards[_epoch].longestProvenLength;
  }

  function getProverShares(Epoch _epoch, uint256 _length, address _prover) external view returns (uint256) {
    return RewardLib.getStorage().epochRewards[_epoch].subEpoch[_length].shares[_prover];
  }

  function getSummedShares(Epoch _epoch, uint256 _length) external view returns (uint256) {
    return RewardLib.getStorage().epochRewards[_epoch].subEpoch[_length].summedShares;
  }
}
