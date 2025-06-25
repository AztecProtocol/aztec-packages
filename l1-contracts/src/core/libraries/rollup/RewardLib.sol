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
import {Epoch, Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {BitMaps} from "@oz/utils/structs/BitMaps.sol";

type Bps is uint32;

library BpsLib {
  function mul(uint256 _a, Bps _b) internal pure returns (uint256) {
    return _a * uint256(Bps.unwrap(_b)) / 10000;
  }
}

struct SubEpochRewards {
  uint256 summedShares;
  mapping(address prover => uint256 shares) shares;
}

struct EpochRewards {
  uint256 longestProvenLength;
  uint256 rewards;
  mapping(uint256 length => SubEpochRewards) subEpoch;
}

struct RewardConfig {
  IRewardDistributor rewardDistributor;
  Bps sequencerBps;
  IBoosterCore booster;
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
  uint256 sequencerBlockReward;
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

  bytes32 private constant REWARD_STORAGE_POSITION = keccak256("aztec.reward.storage");

  // A Cuauhxicalli [kʷaːʍʃiˈkalːi] ("eagle gourd bowl") is a ceremonial Aztec vessel or altar used to hold offerings,
  // such as sacrificial hearts, during rituals performed within temples.
  address public constant BURN_ADDRESS = address(bytes20("CUAUHXICALLI"));

  function setConfig(RewardConfig memory _config) internal {
    RewardStorage storage rewardStorage = getStorage();
    rewardStorage.config = _config;
  }

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
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    RollupStore storage rollupStore = STFLib.getStorage();

    RewardStorage storage rewardStorage = getStorage();

    uint256 accumulatedRewards = 0;
    for (uint256 i = 0; i < _epochs.length; i++) {
      require(
        !_epochs[i].isAcceptingProofsAtEpoch(currentEpoch),
        Errors.Rollup__NotPastDeadline(_epochs[i].toDeadlineEpoch(), currentEpoch)
      );

      require(
        !rewardStorage.proverClaimed[msg.sender].get(Epoch.unwrap(_epochs[i])),
        Errors.Rollup__AlreadyClaimed(msg.sender, _epochs[i])
      );
      rewardStorage.proverClaimed[msg.sender].set(Epoch.unwrap(_epochs[i]));

      EpochRewards storage e = rewardStorage.epochRewards[_epochs[i]];
      SubEpochRewards storage se = e.subEpoch[e.longestProvenLength];
      uint256 shares = se.shares[msg.sender];
      if (shares > 0) {
        accumulatedRewards += (shares * e.rewards / se.summedShares);
      }
    }

    rollupStore.config.feeAsset.transfer(_recipient, accumulatedRewards);

    return accumulatedRewards;
  }

  function handleRewardsAndFees(SubmitEpochRootProofArgs memory _args, Epoch _endEpoch) internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    RewardStorage storage rewardStorage = getStorage();

    bool isRewardDistributorCanonical =
      address(this) == rewardStorage.config.rewardDistributor.canonicalRollup();

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

      $sr.shares[prover] = shares;
      $sr.summedShares += shares;
    }

    if (length > $er.longestProvenLength) {
      Values memory v;
      Totals memory t;

      {
        uint256 added = length - $er.longestProvenLength;
        uint256 blockRewardsAvailable = isRewardDistributorCanonical
          ? rewardStorage.config.rewardDistributor.claimBlockRewards(address(this), added)
          : 0;
        uint256 sequencerShare =
          BpsLib.mul(blockRewardsAvailable, rewardStorage.config.sequencerBps);
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

  function getSharesFor(address _prover) internal view returns (uint256) {
    return getStorage().config.booster.getSharesFor(_prover);
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
    return getStorage().epochRewards[_epoch].subEpoch[_length].shares[_prover] > 0;
  }

  function getHasClaimed(address _prover, Epoch _epoch) internal view returns (bool) {
    return getStorage().proverClaimed[_prover].get(Epoch.unwrap(_epoch));
  }

  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover)
    internal
    view
    returns (uint256)
  {
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

  function fieldToAddress(bytes32 _f) private pure returns (address) {
    return address(uint160(uint256(_f)));
  }
}
