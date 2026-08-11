// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {CompressedFeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Epoch, Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {BitMaps} from "@oz/utils/structs/BitMaps.sol";

type Bps is uint32;

interface IEligible {
  function isEligible() external view returns (bool);
}

library BpsLib {
  function mul(uint256 _a, Bps _b) internal pure returns (uint256) {
    return _a * uint256(Bps.unwrap(_b)) / 10_000;
  }
}

struct SubEpochRewards {
  uint256 summedShares;
  mapping(address prover => uint256 shares) shares;
}

struct EpochRewards {
  uint128 longestProvenLength;
  uint128 rewards;
  mapping(uint256 length => SubEpochRewards) subEpoch;
}

struct RewardConfig {
  IRewardDistributor rewardDistributor;
  Bps sequencerBps;
  IBoosterCore booster;
  uint96 checkpointReward;
}

/// @notice The post-deployment-mutable subset of {RewardConfig}.
/// @dev `rewardDistributor` and `booster` are deliberately *not* in this struct: they are
///      set once at construction and immutable thereafter.
struct MutableRewardConfig {
  Bps sequencerBps;
  uint96 checkpointReward;
}

struct RewardStorage {
  mapping(address => uint256) sequencerRewards;
  mapping(Epoch => EpochRewards) epochRewards;
  mapping(address prover => BitMaps.BitMap claimed) proverClaimed;
  RewardConfig config;
}

struct Values {
  address sequencer;
  uint256 proverFee;
  uint256 sequencerFee;
  uint256 sequencerCheckpointReward;
  uint256 manaUsed;
}

struct Totals {
  uint256 feesToClaim;
  uint256 totalBurn;
}

library RewardLib {
  using SafeERC20 for IERC20;
  using BitMaps for BitMaps.BitMap;
  using TimeLib for Timestamp;
  using TimeLib for Epoch;
  using FeeHeaderLib for CompressedFeeHeader;
  using SafeCast for uint256;

  bytes32 private constant REWARD_STORAGE_POSITION = keccak256("aztec.reward.storage");

  // A Cuauhxicalli [kʷaːʍʃiˈkalːi] ("eagle gourd bowl") is a ceremonial Aztec vessel or altar used to hold
  // offerings,
  // such as sacrificial hearts, during rituals performed within temples.
  address public constant BURN_ADDRESS = address(bytes20("CUAUHXICALLI"));

  /// @dev Enough for a getter behind a proxy (2 cold account accesses + a few SLOADs), while
  ///      bounding how much gas a hostile coinbase can burn per checkpoint during proof submission.
  uint256 private constant ELIGIBILITY_PROBE_GAS = 50_000;

  /// @notice One-shot writer used during rollup construction. Writes every field of
  ///         {RewardConfig}, including the immutable `rewardDistributor` and `booster`.
  /// @dev Must only be reachable from the constructor path. Post-deployment updates go through
  ///      {updateConfig}, which preserves the immutable fields.
  function initializeConfig(RewardConfig memory _config) internal {
    require(Bps.unwrap(_config.sequencerBps) <= 10_000, Errors.RewardLib__InvalidSequencerBps());
    RewardStorage storage rewardStorage = getStorage();
    rewardStorage.config = _config;
  }

  /// @notice Owner-gated post-deployment writer. Only updates the mutable subset
  ///         (`sequencerBps`, `checkpointReward`). The `rewardDistributor` and `booster`
  ///         addresses MUST NOT be reachable from this path -- they remain whatever was
  ///         written by {initializeConfig}.
  function updateConfig(MutableRewardConfig memory _config) internal {
    require(Bps.unwrap(_config.sequencerBps) <= 10_000, Errors.RewardLib__InvalidSequencerBps());
    RewardStorage storage rewardStorage = getStorage();
    rewardStorage.config.sequencerBps = _config.sequencerBps;
    rewardStorage.config.checkpointReward = _config.checkpointReward;
  }

  function claimSequencerRewards(address _sequencer) internal returns (uint256) {
    RewardStorage storage rewardStorage = getStorage();
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 amount = rewardStorage.sequencerRewards[_sequencer];

    if (amount > 0) {
      rewardStorage.sequencerRewards[_sequencer] = 0;
      rollupStore.config.feeAsset.safeTransfer(_sequencer, amount);
    }

    return amount;
  }

  function claimProverRewards(address _prover, Epoch[] memory _epochs) internal returns (uint256) {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    RollupStore storage rollupStore = STFLib.getStorage();

    RewardStorage storage rewardStorage = getStorage();

    uint256 accumulatedRewards = 0;
    for (uint256 i = 0; i < _epochs.length; i++) {
      require(
        !_epochs[i].isAcceptingProofsAtEpoch(currentEpoch),
        Errors.Rollup__NotPastDeadline(_epochs[i].toDeadlineEpoch(), currentEpoch)
      );

      if (rewardStorage.proverClaimed[_prover].get(Epoch.unwrap(_epochs[i]))) {
        continue;
      }
      rewardStorage.proverClaimed[_prover].set(Epoch.unwrap(_epochs[i]));

      EpochRewards storage e = rewardStorage.epochRewards[_epochs[i]];
      SubEpochRewards storage se = e.subEpoch[e.longestProvenLength];
      uint256 shares = se.shares[_prover];
      if (shares > 0) {
        accumulatedRewards += (shares * e.rewards / se.summedShares);
      }
    }

    if (accumulatedRewards > 0) {
      rollupStore.config.feeAsset.safeTransfer(_prover, accumulatedRewards);
    }

    return accumulatedRewards;
  }

  function handleRewardsAndFees(SubmitEpochRootProofArgs calldata _args, Epoch _endEpoch) internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    RewardStorage storage rewardStorage = getStorage();

    uint256 length = _args.end - _args.start + 1;
    EpochRewards storage $er = rewardStorage.epochRewards[_endEpoch];

    {
      SubEpochRewards storage $sr = $er.subEpoch[length];
      address prover = _args.args.proverId;

      require($sr.shares[prover] == 0, Errors.Rollup__ProverHaveAlreadySubmitted(prover, _endEpoch));
      // Beware that it is possible to get marked active in an epoch even if you did not provide the longest
      // proof. This is acceptable, as they were actually active. And boosting this way is not the most
      // efficient way to do it, so this is fine.
      uint256 shares = rewardStorage.config.booster.updateAndGetShares(prover);

      // The duplicate-submission guard above uses `shares == 0` as the sentinel for "not yet
      // submitted". A booster that ever returns zero would let the same prover submit again
      // for the same epoch length, breaking that guard. RewardBooster's constructor rejects
      // configs that can return zero, but the booster slot is an external pointer; bounce
      // back if a misbehaving booster ever crosses this layer.
      require(shares > 0, Errors.RewardLib__ZeroShares(prover));

      $sr.shares[prover] = shares;
      $sr.summedShares += shares;
    }

    if (length > $er.longestProvenLength) {
      Values memory v;
      Totals memory t;

      bool[] memory eligible = new bool[](length);

      {
        uint256 added = length - $er.longestProvenLength;
        uint256 eligibleCount = 0;
        for (uint256 i = $er.longestProvenLength; i < length; i++) {
          eligible[i] = isEligible(_args.headers[i].coinbase);
          if (eligible[i]) {
            eligibleCount++;
          }
        }

        // Per-checkpoint sequencer share of the checkpoint reward; the rest goes to the provers.
        uint256 sequencerShare = BpsLib.mul(getCheckpointReward(), rewardStorage.config.sequencerBps);

        // Only claim what is owed from the distributor: the prover share for every added
        // checkpoint, plus the sequencer share for checkpoints with an eligible coinbase.
        // The sequencer share of ineligible checkpoints never leaves the distributor.
        uint256 checkpointRewardsDesired = added * getCheckpointReward() - (added - eligibleCount) * sequencerShare;
        uint256 checkpointRewardsAvailable = 0;

        if (checkpointRewardsDesired > 0) {
          // Cache the reward distributor contract
          IRewardDistributor distributor = rewardStorage.config.rewardDistributor;

          uint256 amountToClaim = Math.min(checkpointRewardsDesired, distributor.availableTo(address(this)));

          if (amountToClaim > 0) {
            distributor.claim(address(this), amountToClaim);
            checkpointRewardsAvailable = amountToClaim;
          }
        }

        // If the distributor could not cover the full amount, both pots scale proportionally.
        uint256 sequencerCheckpointRewards = checkpointRewardsDesired == 0
          ? 0
          : checkpointRewardsAvailable * (eligibleCount * sequencerShare) / checkpointRewardsDesired;
        v.sequencerCheckpointReward = eligibleCount == 0 ? 0 : sequencerCheckpointRewards / eligibleCount;

        // Rounding dust from the sequencer pot lands with the provers.
        uint256 proverCheckpointRewards = checkpointRewardsAvailable - v.sequencerCheckpointReward * eligibleCount;
        if (proverCheckpointRewards > 0) {
          $er.rewards += proverCheckpointRewards.toUint128();
        }
      }

      for (uint256 i = $er.longestProvenLength; i < length; i++) {
        CompressedFeeHeader feeHeader = STFLib.getFeeHeader(_args.start + i);

        v.manaUsed = feeHeader.getManaUsed();

        uint256 fee = _args.headers[i].accumulatedFees;
        uint256 burn = feeHeader.getCongestionCost() * v.manaUsed;

        t.feesToClaim += fee;
        t.totalBurn += burn;

        // Compute the proving fee in the fee asset
        v.proverFee = Math.min(v.manaUsed * feeHeader.getProverCost(), fee - burn);
        if (v.proverFee > 0) {
          $er.rewards += v.proverFee.toUint128();
        }

        v.sequencerFee = fee - burn - v.proverFee;

        {
          v.sequencer = _args.headers[i].coinbase;
          uint256 toSequencer = v.sequencerFee;
          if (eligible[i]) {
            toSequencer += v.sequencerCheckpointReward;
          }
          if (toSequencer > 0) {
            rewardStorage.sequencerRewards[v.sequencer] += toSequencer;
          }
        }
      }

      $er.longestProvenLength = length.toUint128();

      if (t.feesToClaim > 0) {
        rollupStore.config.feeAssetPortal.distributeFees(address(this), t.feesToClaim);
      }

      if (t.totalBurn > 0) {
        rollupStore.config.feeAsset.safeTransfer(BURN_ADDRESS, t.totalBurn);
      }
    }
  }

  /// @dev Placeholder eligibility test for the checkpoint reward: the coinbase qualifies only if
  ///      it is a contract answering true to {IEligible.isEligible}. The coinbase is an arbitrary
  ///      proposer-chosen address, so the probe is a gas-capped staticcall whose failure modes
  ///      (no code, revert, wrong return shape) all read as ineligible -- it must never revert,
  ///      or a hostile coinbase could block epoch proof submission.
  function isEligible(address _coinbase) private view returns (bool) {
    (bool success, bytes memory returnData) =
      _coinbase.staticcall{gas: ELIGIBILITY_PROBE_GAS}(abi.encodeCall(IEligible.isEligible, ()));
    return success && returnData.length == 32 && uint256(bytes32(returnData)) == 1;
  }

  function getSharesFor(address _prover) internal view returns (uint256) {
    return getStorage().config.booster.getSharesFor(_prover);
  }

  function getSequencerRewards(address _sequencer) internal view returns (uint256) {
    return getStorage().sequencerRewards[_sequencer];
  }

  function getCollectiveProverRewardsForEpoch(Epoch _epoch) internal view returns (uint256) {
    return getStorage().epochRewards[_epoch].rewards;
  }

  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover) internal view returns (bool) {
    return getStorage().epochRewards[_epoch].subEpoch[_length].shares[_prover] > 0;
  }

  function getHasClaimed(address _prover, Epoch _epoch) internal view returns (bool) {
    return getStorage().proverClaimed[_prover].get(Epoch.unwrap(_epoch));
  }

  function getCheckpointReward() internal view returns (uint256) {
    return getStorage().config.checkpointReward;
  }

  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover) internal view returns (uint256) {
    RewardStorage storage rewardStorage = getStorage();

    if (rewardStorage.proverClaimed[_prover].get(Epoch.unwrap(_epoch))) {
      return 0;
    }

    EpochRewards storage er = rewardStorage.epochRewards[_epoch];
    SubEpochRewards storage se = er.subEpoch[er.longestProvenLength];

    // Only if prover has shares will he get a reward. Also avoid a 0-div
    // in case of no shares at all.
    if (se.shares[_prover] == 0) {
      return 0;
    }

    return (se.shares[_prover] * er.rewards / se.summedShares);
  }

  function getStorage() internal pure returns (RewardStorage storage storageStruct) {
    bytes32 position = REWARD_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }
}
