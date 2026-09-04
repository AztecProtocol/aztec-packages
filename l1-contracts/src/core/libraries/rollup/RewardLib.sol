// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {CompressedFeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {Epoch, Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {BitMaps} from "@oz/utils/structs/BitMaps.sol";

type Bps is uint32;

interface IRegistryProvider {
  function getRegistry() external view returns (address);
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

uint256 constant MAX_REGISTRY_REWARD_OVERRIDES = 2;

struct RegistryRewardOverride {
  address registry;
  uint96 sequencerReward;
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
  address protocolFeeRecipient;
}

struct Values {
  address sequencer;
  uint256 proverFee;
  uint256 sequencerFee;
  uint256[] sequencerCheckpointRewards;
  uint256 manaUsed;
}

struct SequencerRewardContext {
  uint256[] proposerRewards;
  uint256 cachedProposers;
  GSE gse;
  RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] registryRewardOverrides;
}

struct Totals {
  uint256 feesToClaim;
  uint256 totalProtocolFee;
}

library RewardLib {
  using SafeERC20 for IERC20;
  using BitMaps for BitMaps.BitMap;
  using TimeLib for Timestamp;
  using TimeLib for Epoch;
  using FeeHeaderLib for CompressedFeeHeader;
  using SafeCast for uint256;

  bytes32 private constant REWARD_STORAGE_POSITION = keccak256("aztec.reward.storage");

  uint256 private constant REGISTRY_PROBE_GAS_LIMIT = 50_000;

  /// @notice One-shot writer used during rollup construction. Writes every field of
  ///         {RewardConfig}, including the immutable `rewardDistributor` and `booster`.
  /// @dev Must only be reachable from the constructor path. Post-deployment updates go through
  ///      {updateConfig}, which preserves the immutable fields.
  function initializeConfig(RewardConfig memory _config) internal {
    require(Bps.unwrap(_config.sequencerBps) <= 10_000, Errors.RewardLib__InvalidSequencerBps());
    RewardStorage storage rewardStorage = getStorage();
    rewardStorage.config = _config;
    // A Cuauhxicalli ("eagle gourd bowl") is a ceremonial Aztec vessel used to hold offerings.
    rewardStorage.protocolFeeRecipient = address(bytes20("CUAUHXICALLI"));
  }

  /// @notice Owner-gated post-deployment writer for the protocol fee recipient.
  /// @param _recipient The new recipient of the protocol fee tranche
  /// @return oldRecipient The recipient in effect before this call
  function updateProtocolFeeRecipient(address _recipient) internal returns (address oldRecipient) {
    require(_recipient != address(0), Errors.RewardLib__InvalidProtocolFeeRecipient());
    RewardStorage storage rewardStorage = getStorage();
    oldRecipient = rewardStorage.protocolFeeRecipient;
    rewardStorage.protocolFeeRecipient = _recipient;
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

  function handleRewardsAndFees(
    SubmitEpochRootProofArgs calldata _args,
    Epoch _endEpoch,
    address[] memory _committee,
    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory _registryRewardOverrides,
    bool _fullEpochProof
  ) internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    RewardStorage storage rewardStorage = getStorage();

    uint256 length = _args.end - _args.start + 1;
    EpochRewards storage $er = rewardStorage.epochRewards[_endEpoch];

    {
      SubEpochRewards storage $sr = $er.subEpoch[length];
      address prover = _args.args.proverId;

      require($sr.shares[prover] == 0, Errors.Rollup__ProverHaveAlreadySubmitted(prover, _endEpoch));
      // The prover is only marked active if they have provided a full epoch proof
      uint256 shares = _fullEpochProof
        ? rewardStorage.config.booster.updateAndGetShares(prover)
        : rewardStorage.config.booster.getSharesFor(prover);

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

      {
        uint256 added = length - $er.longestProvenLength;
        uint256 checkpointReward = getCheckpointReward();
        uint256 defaultSequencerRewardPerCheckpoint = BpsLib.mul(checkpointReward, rewardStorage.config.sequencerBps);

        (uint256 desiredSequencerRewardsTotal, uint256[] memory sequencerCheckpointRewards) = computeDesiredSequencerRewards(
          _args,
          _endEpoch,
          _committee,
          _registryRewardOverrides,
          $er.longestProvenLength,
          defaultSequencerRewardPerCheckpoint
        );

        v.sequencerCheckpointRewards = sequencerCheckpointRewards;

        uint256 proverRewardPerCheckpoint = checkpointReward - defaultSequencerRewardPerCheckpoint;
        uint256 checkpointRewardsDesired = proverRewardPerCheckpoint * added + desiredSequencerRewardsTotal;
        uint256 maximumCheckpointRewards = added * checkpointReward;

        require(
          checkpointRewardsDesired <= maximumCheckpointRewards,
          Errors.RewardLib__CheckpointRewardsAboveMaximum(checkpointRewardsDesired, maximumCheckpointRewards)
        );

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

        uint256 sequencerCheckpointRewardTotal = desiredSequencerRewardsTotal;
        if (checkpointRewardsAvailable < checkpointRewardsDesired) {
          sequencerCheckpointRewardTotal = 0;
          for (uint256 i = $er.longestProvenLength; i < length; i++) {
            uint256 index = i - $er.longestProvenLength;
            sequencerCheckpointRewards[index] =
              Math.mulDiv(v.sequencerCheckpointRewards[index], checkpointRewardsAvailable, checkpointRewardsDesired);
            sequencerCheckpointRewardTotal += v.sequencerCheckpointRewards[index];
          }
        }

        uint256 proverCheckpointRewards = checkpointRewardsAvailable - sequencerCheckpointRewardTotal;
        if (proverCheckpointRewards > 0) {
          $er.rewards += proverCheckpointRewards.toUint128();
        }
      }

      Totals memory t;
      for (uint256 i = $er.longestProvenLength; i < length; i++) {
        uint256 index = i - $er.longestProvenLength;
        CompressedFeeHeader feeHeader = STFLib.getFeeHeader(_args.start + i);

        v.manaUsed = feeHeader.getManaUsed();

        uint256 fee = _args.headers[i].accumulatedFees;
        uint256 protocolFee = feeHeader.getProtocolFee() * v.manaUsed;

        t.feesToClaim += fee;
        t.totalProtocolFee += protocolFee;

        // Compute the proving fee in the fee asset
        v.proverFee = Math.min(v.manaUsed * feeHeader.getProverCost(), fee - protocolFee);
        if (v.proverFee > 0) {
          $er.rewards += v.proverFee.toUint128();
        }

        v.sequencerFee = fee - protocolFee - v.proverFee;

        {
          v.sequencer = _args.headers[i].coinbase;
          uint256 toSequencer = v.sequencerCheckpointRewards[index] + v.sequencerFee;
          if (toSequencer > 0) {
            rewardStorage.sequencerRewards[v.sequencer] += toSequencer;
          }
        }
      }

      $er.longestProvenLength = length.toUint128();

      if (t.feesToClaim > 0) {
        rollupStore.config.feeAssetPortal.distributeFees(address(this), t.feesToClaim);
      }

      if (t.totalProtocolFee > 0) {
        rollupStore.config.feeAsset.safeTransfer(rewardStorage.protocolFeeRecipient, t.totalProtocolFee);
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

  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover) internal view returns (bool) {
    return getStorage().epochRewards[_epoch].subEpoch[_length].shares[_prover] > 0;
  }

  function getHasClaimed(address _prover, Epoch _epoch) internal view returns (bool) {
    return getStorage().proverClaimed[_prover].get(Epoch.unwrap(_epoch));
  }

  function getCheckpointReward() internal view returns (uint256) {
    return getStorage().config.checkpointReward;
  }

  function getProtocolFeeRecipient() internal view returns (address) {
    return getStorage().protocolFeeRecipient;
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

  function tryGetRegistry(address _withdrawer) internal view returns (bool responded, address registry) {
    if (_withdrawer.code.length == 0) {
      return (false, address(0));
    }

    uint256 selector = uint32(IRegistryProvider.getRegistry.selector);

    assembly ("memory-safe") {
      mstore(0x00, shl(224, selector))
      let callSucceeded := staticcall(REGISTRY_PROBE_GAS_LIMIT, _withdrawer, 0x00, 0x04, 0x20, 0x20)
      let result := mload(0x20)
      responded := and(and(callSucceeded, eq(returndatasize(), 0x20)), iszero(shr(160, result)))
      registry := 0
      if responded {
        registry := and(result, sub(shl(160, 1), 1))
      }
    }
  }

  function validateRegistryRewardOverrides(
    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory _overrides,
    RewardConfig memory _rewardConfig
  ) internal pure {
    uint256 defaultSequencerReward = BpsLib.mul(_rewardConfig.checkpointReward, _rewardConfig.sequencerBps);

    for (uint256 i = 0; i < MAX_REGISTRY_REWARD_OVERRIDES; i++) {
      RegistryRewardOverride memory current = _overrides[i];
      if (current.registry == address(0)) {
        require(
          current.sequencerReward == 0,
          Errors.RewardLib__InvalidRegistryRewardOverride(current.registry, current.sequencerReward)
        );
        continue;
      }

      require(
        current.sequencerReward <= defaultSequencerReward,
        Errors.RewardLib__RegistryRewardOverrideAboveDefault(
          current.registry, current.sequencerReward, defaultSequencerReward
        )
      );

      for (uint256 j = 0; j < i; j++) {
        require(
          _overrides[j].registry != current.registry,
          Errors.RewardLib__DuplicateRegistryRewardOverride(current.registry)
        );
      }
    }
  }

  function getStorage() internal pure returns (RewardStorage storage storageStruct) {
    bytes32 position = REWARD_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }

  function computeDesiredSequencerRewards(
    SubmitEpochRootProofArgs calldata _args,
    Epoch _endEpoch,
    address[] memory _committee,
    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory _registryRewardOverrides,
    uint256 _from,
    uint256 _defaultSequencerRewardPerCheckpoint
  ) private view returns (uint256, uint256[] memory) {
    uint256[] memory desiredSequencerCheckpointRewards = new uint256[](_args.end - _args.start + 1 - _from);

    if (_committee.length == 0 || !hasRegistryRewardOverrides(_registryRewardOverrides)) {
      for (uint256 i = 0; i < desiredSequencerCheckpointRewards.length; i++) {
        desiredSequencerCheckpointRewards[i] = _defaultSequencerRewardPerCheckpoint;
      }

      return (
        _defaultSequencerRewardPerCheckpoint * desiredSequencerCheckpointRewards.length,
        desiredSequencerCheckpointRewards
      );
    }

    uint256 seed = ValidatorSelectionLib.getSampleSeed(_endEpoch);
    uint256 desiredSequencerRewardsTotal = 0;
    SequencerRewardContext memory context;
    context.proposerRewards = new uint256[](_committee.length);
    context.gse = StakingLib.getStorage().gse;
    context.registryRewardOverrides = _registryRewardOverrides;
    for (uint256 i = 0; i < desiredSequencerCheckpointRewards.length; i++) {
      uint256 proposerIndex = ValidatorSelectionLib.computeProposerIndex(
        _endEpoch, _args.headers[_from + i].slotNumber, seed, _committee.length
      );
      uint256 proposerMask = uint256(1) << proposerIndex;
      if (context.cachedProposers & proposerMask == 0) {
        context.proposerRewards[proposerIndex] = getDesiredSequencerRewardForProposer(
          _committee[proposerIndex], context, _defaultSequencerRewardPerCheckpoint
        );
        context.cachedProposers |= proposerMask;
      }

      uint256 reward = context.proposerRewards[proposerIndex];
      desiredSequencerCheckpointRewards[i] = reward;
      desiredSequencerRewardsTotal += reward;
    }

    return (desiredSequencerRewardsTotal, desiredSequencerCheckpointRewards);
  }

  function getDesiredSequencerRewardForProposer(
    address _proposer,
    SequencerRewardContext memory _context,
    uint256 _defaultSequencerRewardPerCheckpoint
  ) private view returns (uint256) {
    address withdrawer = _context.gse.getWithdrawer(_proposer);
    (bool responded, address registry) = tryGetRegistry(withdrawer);
    if (!responded || registry == address(0)) {
      return _defaultSequencerRewardPerCheckpoint;
    }

    for (uint256 i = 0; i < MAX_REGISTRY_REWARD_OVERRIDES; i++) {
      RegistryRewardOverride memory current = _context.registryRewardOverrides[i];
      if (current.registry == registry) {
        return Math.min(_defaultSequencerRewardPerCheckpoint, current.sequencerReward);
      }
    }

    return _defaultSequencerRewardPerCheckpoint;
  }

  function hasRegistryRewardOverrides(RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory _registryRewardOverrides)
    private
    pure
    returns (bool)
  {
    for (uint256 i = 0; i < MAX_REGISTRY_REWARD_OVERRIDES; i++) {
      if (_registryRewardOverrides[i].registry != address(0)) {
        return true;
      }
    }

    return false;
  }
}
