// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  CompressedFeeHeader,
  FeeHeaderLib,
  FeeLib,
  FeeStore
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Epoch, Timestamp, Slot, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";

struct SubEpochRewards {
  uint256 summedCount;
  mapping(address prover => bool proofSubmitted) hasSubmitted;
}

struct EpochRewards {
  uint256 longestProvenLength;
  uint256 rewards;
  mapping(uint256 length => SubEpochRewards) subEpoch;
}

struct RewardStorage {
  mapping(address => uint256) sequencerRewards;
  mapping(Epoch => EpochRewards) epochRewards;
  // @todo Below can be optimised with a bitmap as we can benefit from provers likely proving for epochs close
  // to one another.
  mapping(address prover => mapping(Epoch epoch => bool claimed)) proverClaimed;
}

struct Values {
  address sequencer;
  uint256 proverFee;
  uint256 sequencerFee;
  uint256 sequencerBlockReward;
  uint256 manaUsed;
}

struct Totals {
  uint256 feesToClaim;
  uint256 totalBurn;
}

library RewardLib {
  using SafeERC20 for IERC20;

  using TimeLib for Timestamp;
  using TimeLib for Epoch;
  using FeeHeaderLib for CompressedFeeHeader;

  bytes32 private constant REWARD_STORAGE_POSITION = keccak256("aztec.reward.storage");

  // A Cuauhxicalli [kʷaːʍʃiˈkalːi] ("eagle gourd bowl") is a ceremonial Aztec vessel or altar used to hold offerings,
  // such as sacrificial hearts, during rituals performed within temples.
  address public constant BURN_ADDRESS = address(bytes20("CUAUHXICALLI"));

  function claimSequencerRewards(address _recipient) internal returns (uint256) {
    RewardStorage storage rewardStorage = getStorage();

    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 amount = rewardStorage.sequencerRewards[msg.sender];
    rewardStorage.sequencerRewards[msg.sender] = 0;
    rollupStore.config.feeAsset.transfer(_recipient, amount);

    return amount;
  }

  function claimProverRewards(address _recipient, Epoch[] memory _epochs)
    internal
    returns (uint256)
  {
    Slot currentSlot = Timestamp.wrap(block.timestamp).slotFromTimestamp();
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 proofSubmissionWindow = rollupStore.config.proofSubmissionWindow;

    RewardStorage storage rewardStorage = getStorage();

    uint256 accumulatedRewards = 0;
    for (uint256 i = 0; i < _epochs.length; i++) {
      Slot deadline = _epochs[i].toSlots() + Slot.wrap(proofSubmissionWindow);
      require(deadline < currentSlot, Errors.Rollup__NotPastDeadline(deadline, currentSlot));

      // We can use fancier bitmaps for performance
      require(
        !rewardStorage.proverClaimed[msg.sender][_epochs[i]],
        Errors.Rollup__AlreadyClaimed(msg.sender, _epochs[i])
      );
      rewardStorage.proverClaimed[msg.sender][_epochs[i]] = true;

      EpochRewards storage e = rewardStorage.epochRewards[_epochs[i]];
      if (e.subEpoch[e.longestProvenLength].hasSubmitted[msg.sender]) {
        accumulatedRewards += (e.rewards / e.subEpoch[e.longestProvenLength].summedCount);
      }
    }

    rollupStore.config.feeAsset.transfer(_recipient, accumulatedRewards);

    return accumulatedRewards;
  }

  function handleRewardsAndFees(SubmitEpochRootProofArgs memory _args, Epoch _endEpoch) internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    RewardStorage storage rewardStorage = getStorage();

    bool isRewardDistributorCanonical =
      address(this) == rollupStore.config.rewardDistributor.canonicalRollup();

    uint256 length = _args.end - _args.start + 1;
    EpochRewards storage $er = rewardStorage.epochRewards[_endEpoch];
    SubEpochRewards storage $sr = $er.subEpoch[length];

    {
      address prover = _args.args.proverId;
      require(
        !$sr.hasSubmitted[prover], Errors.Rollup__ProverHaveAlreadySubmitted(prover, _endEpoch)
      );
      $sr.hasSubmitted[prover] = true;
    }
    $sr.summedCount += 1;

    if (length > $er.longestProvenLength) {
      Values memory v;
      Totals memory t;

      {
        uint256 added = length - $er.longestProvenLength;
        uint256 blockRewardsAvailable = isRewardDistributorCanonical
          ? rollupStore.config.rewardDistributor.claimBlockRewards(address(this), added)
          : 0;
        uint256 sequencerShare = blockRewardsAvailable / 2;
        v.sequencerBlockReward = sequencerShare / added;

        $er.rewards += (blockRewardsAvailable - sequencerShare);
      }

      FeeStore storage feeStore = FeeLib.getStorage();

      for (uint256 i = $er.longestProvenLength; i < length; i++) {
        CompressedFeeHeader storage feeHeader = feeStore.feeHeaders[_args.start + i];

        v.manaUsed = feeHeader.getManaUsed();

        uint256 fee = uint256(_args.fees[1 + i * 2]);
        uint256 burn = feeHeader.getCongestionCost() * v.manaUsed;

        t.feesToClaim += fee;
        t.totalBurn += burn;

        // Compute the proving fee in the fee asset
        v.proverFee = Math.min(v.manaUsed * feeHeader.getProverCost(), fee - burn);
        $er.rewards += v.proverFee;

        v.sequencerFee = fee - burn - v.proverFee;

        {
          v.sequencer = fieldToAddress(_args.fees[i * 2]);
          rewardStorage.sequencerRewards[v.sequencer] += (v.sequencerBlockReward + v.sequencerFee);
        }
      }

      $er.longestProvenLength = length;

      if (t.feesToClaim > 0) {
        rollupStore.config.feeAssetPortal.distributeFees(address(this), t.feesToClaim);
      }

      if (t.totalBurn > 0) {
        rollupStore.config.feeAsset.transfer(BURN_ADDRESS, t.totalBurn);
      }
    }
  }

  function getSequencerRewards(address _sequencer) internal view returns (uint256) {
    return getStorage().sequencerRewards[_sequencer];
  }

  function getCollectiveProverRewardsForEpoch(Epoch _epoch) internal view returns (uint256) {
    return getStorage().epochRewards[_epoch].rewards;
  }

  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover)
    internal
    view
    returns (bool)
  {
    return getStorage().epochRewards[_epoch].subEpoch[_length].hasSubmitted[_prover];
  }

  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover)
    internal
    view
    returns (uint256)
  {
    RewardStorage storage rewardStorage = getStorage();

    if (rewardStorage.proverClaimed[_prover][_epoch]) {
      return 0;
    }

    EpochRewards storage er = rewardStorage.epochRewards[_epoch];
    uint256 length = er.longestProvenLength;

    if (er.subEpoch[length].hasSubmitted[_prover]) {
      return er.rewards / er.subEpoch[length].summedCount;
    }

    return 0;
  }

  function getStorage() internal pure returns (RewardStorage storage storageStruct) {
    bytes32 position = REWARD_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }

  function fieldToAddress(bytes32 _f) private pure returns (address) {
    return address(uint160(uint256(_f)));
  }
}
