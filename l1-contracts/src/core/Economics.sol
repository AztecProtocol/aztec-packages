// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BlobLib} from "@aztec-blob-lib/BlobLib.sol";
import {IEconomics} from "@aztec/core/interfaces/IEconomics.sol";
import {
  EthPerFeeAssetE12,
  EthValue,
  FeeAssetValue,
  ETH_PER_FEE_ASSET_PRECISION,
  CompressedFeeConfig,
  FeeConfig,
  FeeConfigLib,
  PriceLib
} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {
  CompressedFeeHeader,
  CompressedL1FeeData,
  FeeHeader,
  FeeHeaderLib,
  FeeStructsLib,
  L1FeeData,
  L1GasOracleValues
} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  ActivityScore,
  Bps,
  BpsLib,
  CompressedActivityScore,
  EconomicsInitArgs,
  EpochSettlementPlan,
  ManaMinFeeComponents,
  ProposalFeeParameters,
  RewardBoostConfig,
  RewardConfig
} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {Epoch, TimeLib, Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {CompressedEpoch, CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {SignedMath} from "@oz/utils/math/SignedMath.sol";
import {BitMaps} from "@oz/utils/structs/BitMaps.sol";

/*
 * Fee asset price oracle constants
 *
 * `ethPerFeeAsset` is stored with 1e12 precision. That keeps the compressed value within 48 bits while
 * still leaving room for low-value assets without excessive rounding during ETH <-> fee-asset conversions.
 *
 * The oracle can move the fee asset price by at most +/-1% per checkpoint. The minimum stored value is
 * set to `100` so a 1% move always changes the integer representation by at least one unit.
 */
// Minimum representable ETH-per-fee-asset price.
uint256 constant MIN_ETH_PER_FEE_ASSET = 100;
// Maximum representable ETH-per-fee-asset price.
uint256 constant MAX_ETH_PER_FEE_ASSET = 1e14;
// Maximum absolute fee-asset price modifier allowed per checkpoint, in basis points.
uint256 constant MAX_FEE_ASSET_PRICE_MODIFIER_BPS = 100;
// Estimated L1 gas attributed to proposing a checkpoint.
uint256 constant L1_GAS_PER_CHECKPOINT_PROPOSED = 300_000;
// Estimated L1 gas attributed to verifying an epoch.
uint256 constant L1_GAS_PER_EPOCH_VERIFIED = 3_600_000;
// Baseline multiplier used for congestion pricing.
uint256 constant MINIMUM_CONGESTION_MULTIPLIER = 1e9;
// Chosen so one mana target worth of excess mana increases the multiplier by roughly 12.5%.
// This keeps congestion pricing responsive without making single-checkpoint spikes dominate pricing.
// Divisor used when deriving the congestion update fraction from `manaTarget`.
uint256 constant MAGIC_CONGESTION_VALUE_DIVISOR = 1e8;
// Multiplier used when deriving the congestion update fraction from `manaTarget`.
uint256 constant MAGIC_CONGESTION_VALUE_MULTIPLIER = 854_700_854;
// Blob gas assumed per blob when pricing checkpoint proposals.
uint256 constant BLOB_GAS_PER_BLOB = 2 ** 17;
// Number of blobs assumed per checkpoint when pricing checkpoint proposals.
uint256 constant BLOBS_PER_CHECKPOINT = 3;

struct SubEpochRewards {
  // Total booster shares recorded for this proof length.
  uint256 summedShares;
  // Booster shares credited per prover for this proof length.
  mapping(address prover => uint256 shares) shares;
}

struct EpochRewards {
  // Longest proven prefix length currently settled for the epoch.
  uint128 longestProvenLength;
  // Collective prover rewards accrued for the epoch.
  uint128 rewards;
  // Reward buckets keyed by proven prefix length within the epoch.
  mapping(uint256 length => SubEpochRewards) subEpoch;
}

struct RewardState {
  // Accrued sequencer rewards keyed by sequencer address.
  mapping(address => uint256) sequencerRewards;
  // Reward accounting keyed by settled epoch.
  mapping(Epoch => EpochRewards) epochRewards;
  // Claim bitmap keyed by prover and epoch.
  mapping(address prover => BitMaps.BitMap claimed) proverClaimed;
  // Active reward split and distributor configuration.
  RewardConfig config;
  // Reward-booster parameters applied to prover activity.
  RewardBoostConfig boostConfig;
  // Stored activity-score snapshots keyed by prover.
  mapping(address prover => CompressedActivityScore) activityScores;
}

struct FeeState {
  // Active compressed fee configuration.
  CompressedFeeConfig config;
  // Delayed L1 gas oracle queue.
  L1GasOracleValues l1GasOracleValues;
  // Lowest checkpoint number ever recorded by this economics instance.
  uint128 firstRecordedCheckpoint;
  // Highest checkpoint number ever recorded by this economics instance.
  uint128 highestRecordedCheckpoint;
  // Roundabout storage for checkpoint fee headers.
  mapping(uint256 checkpointNumber => CompressedFeeHeader) feeHeaders;
}

/**
 * @title Economics
 * @author Aztec Labs
 * @notice Economics engine for a single rollup instance.
 * @dev This contract owns fee quoting, oracle tracking, checkpoint fee-header storage, and prover/
 *      sequencer reward accounting for the epochs assigned to it by the rollup.
 */
contract Economics is IEconomics, Ownable {
  using BitMaps for BitMaps.BitMap;
  using SafeERC20 for IERC20;
  using SafeCast for uint256;
  using SafeCast for int256;
  using SignedMath for int256;
  using PriceLib for EthValue;
  using TimeLib for Slot;
  using TimeLib for Timestamp;
  using TimeLib for Epoch;
  using CompressedTimeMath for Slot;
  using CompressedTimeMath for Timestamp;
  using CompressedTimeMath for Epoch;
  using CompressedTimeMath for CompressedSlot;
  using CompressedTimeMath for CompressedEpoch;
  using FeeConfigLib for FeeConfig;
  using FeeConfigLib for CompressedFeeConfig;
  using FeeHeaderLib for FeeHeader;
  using FeeHeaderLib for CompressedFeeHeader;
  using FeeStructsLib for L1FeeData;
  using FeeStructsLib for CompressedL1FeeData;

  // Number of slots an oracle quote may remain queued before it must be refreshed.
  Slot internal constant LIFETIME = Slot.wrap(5);
  // Number of slots of delay before a queued oracle quote becomes active.
  Slot internal constant LAG = Slot.wrap(2);
  // Aztec ceremonial burn sink for congestion fees.
  address private constant BURN_ADDRESS = address(bytes20("CUAUHXICALLI"));

  address private immutable ROLLUP;
  IERC20 private immutable FEE_ASSET;
  CompressedFeeHeader private immutable GENESIS_FEE_HEADER;
  FeeState internal feeState;
  RewardState internal rewardState;

  modifier onlyRollup() {
    require(msg.sender == ROLLUP, Errors.Economics__OnlyRollup(msg.sender));
    _;
  }

  /**
   * @notice Creates a new economics engine for a single rollup instance.
   * @param _governance Owner allowed to update economics configuration.
   * @param _rollup Rollup authorized to drive proposal and proof settlement hooks.
   * @param _feeAsset ERC20 used for checkpoint fees and reward payouts.
   * @param _init Genesis fee, timing, reward, and booster parameters.
   */
  constructor(address _governance, address _rollup, IERC20 _feeAsset, EconomicsInitArgs memory _init)
    Ownable(_governance)
  {
    ROLLUP = _rollup;
    FEE_ASSET = _feeAsset;

    TimeLib.initialize(
      _init.genesisTime, _init.aztecSlotDuration, _init.aztecEpochDuration, _init.aztecProofSubmissionEpochs
    );

    GENESIS_FEE_HEADER = _initializeFees(_init.manaTarget, _init.provingCostPerMana, _init.initialEthPerFeeAsset);
    _setRewardBoostConfig(_init.rewardBoostConfig);
    _setRewardConfig(_init.rewardConfig);
  }

  /**
   * @notice Persists the fee header for an accepted checkpoint.
   * @param _checkpointNumber Number of the checkpoint being recorded.
   * @param _feeAssetPriceModifier Oracle modifier supplied in the proposed header.
   * @param _manaUsed Mana consumed by the accepted checkpoint.
   * @param _congestionCost Congestion component from the validated fee quote.
   * @param _proverCost Prover component from the validated fee quote.
   */
  function recordCheckpoint(
    uint256 _checkpointNumber,
    int256 _feeAssetPriceModifier,
    uint256 _manaUsed,
    uint256 _congestionCost,
    uint256 _proverCost
  ) external override onlyRollup {
    require(
      SignedMath.abs(_feeAssetPriceModifier) <= MAX_FEE_ASSET_PRICE_MODIFIER_BPS,
      Errors.FeeLib__InvalidFeeAssetPriceModifier()
    );

    CompressedFeeHeader parentFeeHeader = _getPricingParentFeeHeader(_checkpointNumber - 1);
    if (feeState.firstRecordedCheckpoint == 0 || _checkpointNumber < feeState.firstRecordedCheckpoint) {
      feeState.firstRecordedCheckpoint = _checkpointNumber.toUint128();
    }
    if (_checkpointNumber > feeState.highestRecordedCheckpoint) {
      feeState.highestRecordedCheckpoint = _checkpointNumber.toUint128();
    }

    _writeFeeHeader(
      _checkpointNumber,
      FeeHeader({
        excessMana: _clampedAdd(
          parentFeeHeader.getExcessMana() + parentFeeHeader.getManaUsed(), -int256(feeState.config.getManaTarget())
        ),
        ethPerFeeAsset: _computeNewEthPerFeeAsset(parentFeeHeader.getEthPerFeeAsset(), _feeAssetPriceModifier),
        manaUsed: _manaUsed,
        congestionCost: _congestionCost,
        proverCost: _proverCost
      })
    );
  }

  /**
   * @notice Finalizes economics for a proof after any canonical checkpoint rewards were claimed.
   * @dev This records booster activity for the prover, finalizes reward accounting for the newly
   *      settled prefix using the funds already routed in by the rollup, credits prover and
   *      sequencer rewards, and burns congestion fees.
   * @param _start Checkpoint number where the proof range begins.
   * @param _end Checkpoint number where the proof range ends.
   * @param _prover Prover credited for the submission.
   * @param _fees Flattened fee payload from the proof submission.
   * @param _endEpoch Epoch the proof settles.
   * @param _checkpointRewardsReceived Amount actually received from the reward distributor.
   */
  function finalizeEpochSettlement(
    uint256 _start,
    uint256 _end,
    address _prover,
    bytes32[] calldata _fees,
    Epoch _endEpoch,
    uint256 _checkpointRewardsReceived
  ) external override onlyRollup {
    uint256 length = _end - _start + 1;
    EpochRewards storage epochRewards = rewardState.epochRewards[_endEpoch];
    SubEpochRewards storage subEpochRewards = epochRewards.subEpoch[length];
    require(subEpochRewards.shares[_prover] == 0, Errors.Rollup__ProverHaveAlreadySubmitted(_prover, _endEpoch));

    // Provers earn booster activity for any valid proof submission, even if it is not the longest proof.
    uint256 shares = _updateAndGetShares(_prover);
    subEpochRewards.shares[_prover] = shares;
    subEpochRewards.summedShares += shares;

    // Shorter proofs still count for booster activity and sub-epoch shares, but they do not change the
    // economically settled prefix for the epoch.
    if (length <= epochRewards.longestProvenLength) {
      return;
    }

    uint256 totalBurn = _finalizeLongestProof(epochRewards, _start, _fees, length, _checkpointRewardsReceived);

    epochRewards.longestProvenLength = length.toUint128();

    if (totalBurn > 0) {
      FEE_ASSET.safeTransfer(BURN_ADDRESS, totalBurn);
    }
  }

  /**
   * @notice Updates the checkpoint mana target.
   * @dev Mana target updates are monotonic and only permit increases.
   * @param _manaTarget New target mana per checkpoint.
   */
  function updateManaTarget(uint256 _manaTarget) external override(IEconomics) onlyOwner {
    _computeManaLimit(_manaTarget);

    FeeConfig memory config = feeState.config.decompress();
    uint256 currentManaTarget = config.manaTarget;
    require(_manaTarget >= currentManaTarget, Errors.Rollup__InvalidManaTarget(currentManaTarget, _manaTarget));
    config.manaTarget = _manaTarget;
    config.congestionUpdateFraction = _manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR;
    feeState.config = config.compress();

    emit IEconomics.ManaTargetUpdated(_manaTarget);
  }

  /**
   * @notice Updates the fixed proving-cost component used in fee quotes.
   * @param _provingCostPerMana New proving cost per mana, denominated in ETH.
   */
  function updateProvingCostPerMana(EthValue _provingCostPerMana) external override(IEconomics) onlyOwner {
    FeeConfig memory config = feeState.config.decompress();
    config.provingCostPerMana = _provingCostPerMana;
    feeState.config = config.compress();
    emit IEconomics.ProvingCostPerManaUpdated(_provingCostPerMana);
  }

  /**
   * @notice Updates the reward split and distributor configuration.
   * @param _config New reward configuration.
   */
  function setRewardConfig(RewardConfig calldata _config) external override(IEconomics) onlyOwner {
    _setRewardConfig(_config);
    emit IEconomics.RewardConfigUpdated(rewardState.config);
  }

  /**
   * @notice Updates the reward-booster curve configuration.
   * @param _config New reward-booster configuration.
   */
  function setRewardBoostConfig(RewardBoostConfig calldata _config) external override(IEconomics) onlyOwner {
    _setRewardBoostConfig(_config);
    emit IEconomics.RewardBoostConfigUpdated(rewardState.boostConfig);
  }

  /**
   * @notice Queues a fresh L1 gas oracle quote once the active quote is old enough.
   * @dev The new quote is written into the delayed `post` slot and becomes active after `LAG`.
   *      This hook is intentionally public so it is possible to refresh the oracle directly
   *      without routing through the rollup.
   */
  function updateL1GasFeeOracle() external override {
    Slot slot = Timestamp.wrap(block.timestamp).slotFromTimestamp();
    Slot acceptableSlot = feeState.l1GasOracleValues.slotOfChange.decompress() + (LIFETIME - LAG);
    if (slot < acceptableSlot) {
      return;
    }

    feeState.l1GasOracleValues = L1GasOracleValues({
      pre: feeState.l1GasOracleValues.post,
      post: L1FeeData({baseFee: block.basefee, blobFee: BlobLib.getBlobBaseFee()}).compress(),
      slotOfChange: (slot + LAG).compress()
    });
  }

  /**
   * @notice Claims all currently available sequencer rewards for `_sequencer`.
   * @param _sequencer Recipient whose reward balance should be withdrawn.
   * @return amount Amount transferred to the sequencer.
   */
  function claimSequencerRewards(address _sequencer) external override(IEconomics) returns (uint256) {
    uint256 amount = rewardState.sequencerRewards[_sequencer];
    if (amount > 0) {
      rewardState.sequencerRewards[_sequencer] = 0;
      FEE_ASSET.safeTransfer(_sequencer, amount);
    }
    return amount;
  }

  /**
   * @notice Claims finalized prover rewards for the requested epochs.
   * @dev Each epoch may be claimed at most once per prover, and only after the proof deadline has
   *      passed for that epoch. The caller controls `_epochs`, so claims are expected to be done in
   *      small caller-paid batches rather than as an unbounded sweep.
   * @param _prover Recipient whose reward balance should be withdrawn.
   * @param _epochs Epochs to claim from.
   * @return accumulatedRewards Total amount transferred to the prover.
   */
  function claimProverRewards(address _prover, Epoch[] calldata _epochs) external override returns (uint256) {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    uint256 accumulatedRewards = 0;
    for (uint256 i = 0; i < _epochs.length; i++) {
      require(
        !_epochs[i].isAcceptingProofsAtEpoch(currentEpoch),
        Errors.Rollup__NotPastDeadline(_epochs[i].toDeadlineEpoch(), currentEpoch)
      );

      if (rewardState.proverClaimed[_prover].get(Epoch.unwrap(_epochs[i]))) {
        continue;
      }
      rewardState.proverClaimed[_prover].set(Epoch.unwrap(_epochs[i]));

      EpochRewards storage epochRewards = rewardState.epochRewards[_epochs[i]];
      SubEpochRewards storage subEpochRewards = epochRewards.subEpoch[epochRewards.longestProvenLength];
      uint256 shares = subEpochRewards.shares[_prover];
      if (shares > 0) {
        accumulatedRewards += shares * epochRewards.rewards / subEpochRewards.summedShares;
      }
    }

    if (accumulatedRewards > 0) {
      FEE_ASSET.safeTransfer(_prover, accumulatedRewards);
    }

    return accumulatedRewards;
  }

  /**
   * @notice Builds the canonical reward-claim plan for a proof submission.
   * @dev The plan only includes checkpoint rewards for newly settled length, and zeroes the
   *      claim amount when the configured rollup is not canonical.
   * @param _length Length proven by the submitted proof.
   * @param _fees Flattened fee payload from the proof submission.
   * @param _endEpoch Epoch the proof settles.
   * @return Settlement instructions for the rollup to execute.
   */
  function getEpochSettlementPlan(uint256 _length, bytes32[] calldata _fees, Epoch _endEpoch)
    external
    view
    override
    returns (EpochSettlementPlan memory)
  {
    IRewardDistributor rewardDistributor = rewardState.config.rewardDistributor;
    EpochRewards storage epochRewards = rewardState.epochRewards[_endEpoch];
    if (_length <= epochRewards.longestProvenLength) {
      return EpochSettlementPlan({
        rewardDistributor: rewardDistributor,
        rewardRecipient: address(this),
        checkpointRewardsToClaim: 0,
        portalFeesToDistribute: 0
      });
    }

    uint256 added = _length - epochRewards.longestProvenLength;
    uint256 checkpointRewardsToClaim = 0;
    // Only the canonical rollup may claim checkpoint rewards. The plan zeroes the amount when the
    // configured rollup is not canonical so the caller does not need to duplicate that logic.
    if (address(rewardDistributor) != address(0) && rewardDistributor.canonicalRollup() == ROLLUP) {
      checkpointRewardsToClaim =
        Math.min(added * uint256(rewardState.config.checkpointReward), FEE_ASSET.balanceOf(address(rewardDistributor)));
    }

    uint256 portalFeesToDistribute = 0;
    for (uint256 i = epochRewards.longestProvenLength; i < _length; i++) {
      portalFeesToDistribute += uint256(_fees[1 + i * 2]);
    }

    return EpochSettlementPlan({
      rewardDistributor: rewardDistributor,
      rewardRecipient: address(this),
      checkpointRewardsToClaim: checkpointRewardsToClaim,
      portalFeesToDistribute: portalFeesToDistribute
    });
  }

  /**
   * @notice Returns the full fee-parameter bundle required for proposal validation.
   * @param _checkpointOfInterest Parent checkpoint the next proposal builds on.
   * @param _timestamp Timestamp used for the L1 oracle lookup.
   * @param _inFeeAsset Whether to convert the quote into fee-asset units.
   * @return Proposal-time fee parameters.
   */
  function getProposalFeeParameters(uint256 _checkpointOfInterest, Timestamp _timestamp, bool _inFeeAsset)
    external
    view
    override
    returns (ProposalFeeParameters memory)
  {
    ManaMinFeeComponents memory feeComponents =
      getManaMinFeeComponentsAt(_checkpointOfInterest, _timestamp, _inFeeAsset);
    return ProposalFeeParameters({
      manaLimit: _computeManaLimit(feeState.config.getManaTarget()),
      manaMinFee: Math.min(
        feeComponents.sequencerCost + feeComponents.proverCost + feeComponents.congestionCost, type(uint128).max
      ),
      feeComponents: feeComponents
    });
  }

  /**
   * @notice Returns the current checkpoint mana limit implied by the stored mana target.
   * @dev This exposes the validated compressed-config view so offchain code does not need to
   *      duplicate `_computeManaLimit(...)`.
   * @return Mana limit for the next checkpoint.
   */
  function getManaLimit() external view override(IEconomics) returns (uint256) {
    return _computeManaLimit(feeState.config.getManaTarget());
  }

  /**
   * @notice Returns the fixed proving-cost component converted into fee-asset units.
   * @dev This uses the same effective pricing parent as proposal quoting so offchain readers do not
   *      need to manually fetch and interpret fee headers across cutovers.
   * @param _checkpointOfInterest Parent checkpoint the next proposal builds on.
   * @return Fixed proving-cost component denominated in the fee asset.
   */
  function getProvingCostPerManaInFeeAsset(uint256 _checkpointOfInterest)
    external
    view
    override(IEconomics)
    returns (FeeAssetValue)
  {
    EthPerFeeAssetE12 ethPerFeeAsset = getEthPerFeeAsset(_checkpointOfInterest);
    return feeState.config.getProvingCostPerMana().toFeeAsset(ethPerFeeAsset);
  }

  /**
   * @notice Returns the stored fee configuration.
   * @return Current fee config snapshot.
   */
  function getFeeConfig() external view override(IEconomics) returns (FeeConfig memory) {
    return feeState.config.decompress();
  }

  /**
   * @notice Returns the stored fee header for a checkpoint.
   * @dev Reverts when the requested checkpoint was never recorded by this economics instance or
   *      has already been overwritten in the fee-header roundabout.
   * @param _checkpointNumber Checkpoint to inspect.
   * @return Decompressed fee header snapshot.
   */
  function getFeeHeader(uint256 _checkpointNumber) external view override(IEconomics) returns (FeeHeader memory) {
    return _readCheckedFeeHeader(_checkpointNumber).decompress();
  }

  /**
   * @notice Returns the stored L1 gas oracle queue.
   * @return Queued oracle values and the slot where `post` becomes active.
   */
  function getL1GasOracleValues() external view override(IEconomics) returns (L1GasOracleValues memory) {
    return feeState.l1GasOracleValues;
  }

  /**
   * @notice Returns the genesis timestamp this economics model uses for slot and epoch math.
   * @return Genesis timestamp for this economics instance.
   */
  function getGenesisTime() external view override returns (Timestamp) {
    return Timestamp.wrap(TimeLib.getStorage().genesisTime);
  }

  /**
   * @notice Returns the slot duration this economics model uses.
   * @return Slot duration in seconds.
   */
  function getSlotDuration() external view override returns (uint256) {
    return TimeLib.getStorage().slotDuration;
  }

  /**
   * @notice Returns the epoch duration in slots this economics model uses.
   * @return Epoch duration in slots.
   */
  function getEpochDuration() external view override returns (uint256) {
    return TimeLib.getStorage().epochDuration;
  }

  /**
   * @notice Returns the proof-submission window in epochs this economics model uses.
   * @return Proof-submission window in epochs.
   */
  function getProofSubmissionEpochs() external view override returns (uint256) {
    return TimeLib.getStorage().proofSubmissionEpochs;
  }

  /**
   * @notice Returns the rollup permanently bound to this economics instance.
   * @return The authorized rollup address.
   */
  function getRollup() external view override returns (address) {
    return ROLLUP;
  }

  /**
   * @notice Returns the fee asset this economics instance accounts in.
   * @return Fee asset token.
   */
  function getFeeAsset() external view override returns (IERC20) {
    return FEE_ASSET;
  }

  /**
   * @notice Returns the active reward configuration.
   * @return Current reward configuration.
   */
  function getRewardConfig() external view override(IEconomics) returns (RewardConfig memory) {
    return rewardState.config;
  }

  /**
   * @notice Returns the reward-booster configuration.
   * @return Booster configuration.
   */
  function getRewardBoostConfig() external view override(IEconomics) returns (RewardBoostConfig memory) {
    return rewardState.boostConfig;
  }

  /**
   * @notice Returns the currently accrued sequencer rewards for `_sequencer`.
   * @param _sequencer Sequencer to inspect.
   * @return Outstanding sequencer rewards.
   */
  function getSequencerRewards(address _sequencer) external view override(IEconomics) returns (uint256) {
    return rewardState.sequencerRewards[_sequencer];
  }

  /**
   * @notice Returns the collective prover rewards allocated for an epoch.
   * @param _epoch Epoch to inspect.
   * @return Total prover rewards for the epoch.
   */
  function getCollectiveProverRewardsForEpoch(Epoch _epoch) external view override(IEconomics) returns (uint256) {
    return rewardState.epochRewards[_epoch].rewards;
  }

  /**
   * @notice Returns the longest proven prefix stored for `_epoch`.
   * @param _epoch Epoch to inspect.
   * @return Longest settled proof length.
   */
  function getLongestProvenLength(Epoch _epoch) external view override(IEconomics) returns (uint256) {
    return rewardState.epochRewards[_epoch].longestProvenLength;
  }

  /**
   * @notice Returns the prover shares recorded for a specific sub-epoch proof length.
   * @param _epoch Epoch to inspect.
   * @param _length Proven length within the epoch.
   * @param _prover Prover to inspect.
   * @return Shares credited to the prover for that sub-epoch.
   */
  function getProverShares(Epoch _epoch, uint256 _length, address _prover)
    external
    view
    override(IEconomics)
    returns (uint256)
  {
    return rewardState.epochRewards[_epoch].subEpoch[_length].shares[_prover];
  }

  /**
   * @notice Returns the total shares recorded for a specific sub-epoch proof length.
   * @param _epoch Epoch to inspect.
   * @param _length Proven length within the epoch.
   * @return Total shares recorded for that sub-epoch.
   */
  function getSummedShares(Epoch _epoch, uint256 _length) external view override(IEconomics) returns (uint256) {
    return rewardState.epochRewards[_epoch].subEpoch[_length].summedShares;
  }

  /**
   * @notice Returns whether `_prover` already submitted for a given sub-epoch length.
   * @param _epoch Epoch to inspect.
   * @param _length Proven length within the epoch.
   * @param _prover Prover to inspect.
   * @return True when the prover already recorded shares for that sub-epoch.
   */
  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover)
    external
    view
    override(IEconomics)
    returns (bool)
  {
    return rewardState.epochRewards[_epoch].subEpoch[_length].shares[_prover] > 0;
  }

  /**
   * @notice Returns whether `_prover` already claimed rewards for `_epoch`.
   * @param _prover Prover to inspect.
   * @param _epoch Epoch to inspect.
   * @return True when the claim bit is set.
   */
  function getHasClaimed(address _prover, Epoch _epoch) external view override(IEconomics) returns (bool) {
    return rewardState.proverClaimed[_prover].get(Epoch.unwrap(_epoch));
  }

  /**
   * @notice Returns the prover rewards claimable for `_prover` in `_epoch`, or `0` if already claimed.
   * @param _epoch Epoch to inspect.
   * @param _prover Prover to inspect.
   * @return Claimable prover rewards for that epoch.
   */
  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover)
    external
    view
    override(IEconomics)
    returns (uint256)
  {
    if (rewardState.proverClaimed[_prover].get(Epoch.unwrap(_epoch))) {
      return 0;
    }

    EpochRewards storage epochRewards = rewardState.epochRewards[_epoch];
    SubEpochRewards storage subEpochRewards = epochRewards.subEpoch[epochRewards.longestProvenLength];
    if (subEpochRewards.shares[_prover] == 0) {
      return 0;
    }

    return subEpochRewards.shares[_prover] * epochRewards.rewards / subEpochRewards.summedShares;
  }

  /**
   * @notice Returns the current booster shares for `_prover`.
   * @param _prover Prover to inspect.
   * @return Shares implied by the current activity score.
   */
  function getSharesFor(address _prover) external view override(IEconomics) returns (uint256) {
    return _toShares(getActivityScore(_prover).value);
  }

  /**
   * @notice Returns the stored activity-score snapshot before applying any epoch decay.
   * @param _prover Prover to inspect.
   * @return Stored activity score snapshot.
   */
  function getStoredActivityScore(address _prover) external view override(IEconomics) returns (ActivityScore memory) {
    CompressedActivityScore storage stored = rewardState.activityScores[_prover];
    return ActivityScore({time: stored.time.decompress(), value: stored.value});
  }

  /**
   * @notice Returns the address used as the congestion-fee burn sink.
   * @return Burn address.
   */
  function getBurnAddress() external pure override(IEconomics) returns (address) {
    return BURN_ADDRESS;
  }

  /**
   * @notice Returns the effective fee-asset price used when quoting the next checkpoint.
   * @dev This follows the same pricing-parent logic as proposal quoting, including the local
   *      genesis fallback for the first checkpoint under a freshly activated economics instance.
   *      See {_getPricingParentFeeHeader}.
   * @param _checkpointOfInterest Parent checkpoint the next proposal builds on.
   * @return Effective ETH-per-fee-asset price for proposal quoting.
   */
  function getEthPerFeeAsset(uint256 _checkpointOfInterest)
    public
    view
    override(IEconomics)
    returns (EthPerFeeAssetE12)
  {
    return EthPerFeeAssetE12.wrap(_getPricingParentFeeHeader(_checkpointOfInterest).getEthPerFeeAsset());
  }

  /**
   * @notice Quotes the minimum fee components at a checkpoint boundary.
   * @dev The quote is built from three pieces:
   *   1. sequencer L1 costs for proposing the next checkpoint,
   *   2. prover costs for eventually verifying the epoch, and
   *   3. congestion pricing derived from the checkpoint's excess mana snapshot.
   *
   *      The quote can be returned either in ETH terms or converted into the fee asset using the
   *      checkpoint's stored `ethPerFeeAsset` value.
   * @param _checkpointOfInterest Parent checkpoint the next proposal builds on.
   * @param _timestamp Timestamp used for the L1 oracle lookup.
   * @param _inFeeAsset Whether to convert the quote into fee-asset units.
   * @return Minimum per-mana fee components for the next checkpoint.
   */
  function getManaMinFeeComponentsAt(uint256 _checkpointOfInterest, Timestamp _timestamp, bool _inFeeAsset)
    public
    view
    override(IEconomics)
    returns (ManaMinFeeComponents memory)
  {
    uint256 manaTarget = feeState.config.getManaTarget();
    L1FeeData memory fees = getL1FeesAt(_timestamp);
    uint256 ethUsed =
      (L1_GAS_PER_CHECKPOINT_PROPOSED * fees.baseFee) + (BLOBS_PER_CHECKPOINT * BLOB_GAS_PER_BLOB * fees.blobFee);

    EthValue sequencerCostPerMana = EthValue.wrap(Math.mulDiv(ethUsed, 1, manaTarget, Math.Rounding.Ceil));
    EthValue proverCostPerMana =
    EthValue.wrap(
        Math.mulDiv(
          Math.mulDiv(L1_GAS_PER_EPOCH_VERIFIED, fees.baseFee, TimeLib.getStorage().epochDuration, Math.Rounding.Ceil),
          1,
          manaTarget,
          Math.Rounding.Ceil
        )
      ) + feeState.config.getProvingCostPerMana();

    EthValue total = sequencerCostPerMana + proverCostPerMana;
    CompressedFeeHeader parentFeeHeader = _getPricingParentFeeHeader(_checkpointOfInterest);
    uint256 excessMana =
      _clampedAdd(parentFeeHeader.getExcessMana() + parentFeeHeader.getManaUsed(), -int256(manaTarget));
    uint256 congestionMultiplierValue = _congestionMultiplier(excessMana);

    EthValue congestionCost =
    EthValue.wrap(
        Math.mulDiv(
          EthValue.unwrap(total), congestionMultiplierValue, MINIMUM_CONGESTION_MULTIPLIER, Math.Rounding.Floor
        )
      ) - total;

    EthPerFeeAssetE12 ethPerFeeAsset = _inFeeAsset
      ? EthPerFeeAssetE12.wrap(parentFeeHeader.getEthPerFeeAsset())
      : EthPerFeeAssetE12.wrap(ETH_PER_FEE_ASSET_PRECISION);

    return ManaMinFeeComponents({
      sequencerCost: FeeAssetValue.unwrap(sequencerCostPerMana.toFeeAsset(ethPerFeeAsset)),
      proverCost: FeeAssetValue.unwrap(proverCostPerMana.toFeeAsset(ethPerFeeAsset)),
      congestionCost: FeeAssetValue.unwrap(congestionCost.toFeeAsset(ethPerFeeAsset)),
      congestionMultiplier: congestionMultiplierValue
    });
  }

  /**
   * @notice Returns the active L1 fee quote for a timestamp.
   * @param _timestamp Timestamp whose slot selects between the queued oracle values.
   * @return L1 gas and blob fee data active at that time.
   */
  function getL1FeesAt(Timestamp _timestamp) public view override(IEconomics) returns (L1FeeData memory) {
    return _timestamp.slotFromTimestamp() < feeState.l1GasOracleValues.slotOfChange.decompress()
      ? feeState.l1GasOracleValues.pre.decompress()
      : feeState.l1GasOracleValues.post.decompress();
  }

  /**
   * @notice Returns the decayed activity score for `_prover` at the current epoch.
   * @param _prover Prover to inspect.
   * @return Current activity score snapshot.
   */
  function getActivityScore(address _prover) public view override(IEconomics) returns (ActivityScore memory) {
    return _activityScoreAt(rewardState.activityScores[_prover], Timestamp.wrap(block.timestamp).epochFromTimestamp());
  }

  /**
   * @notice Initializes fee-model state for the economics genesis checkpoint.
   * @param _manaTarget Initial checkpoint mana target.
   * @param _provingCostPerMana Initial fixed proving cost per mana.
   * @param _initialEthPerFeeAsset Initial fee-asset price.
   * @return Compressed genesis fee header for local pricing fallback.
   */
  function _initializeFees(uint256 _manaTarget, EthValue _provingCostPerMana, EthPerFeeAssetE12 _initialEthPerFeeAsset)
    internal
    returns (CompressedFeeHeader)
  {
    _computeManaLimit(_manaTarget);

    uint256 initialPrice = EthPerFeeAssetE12.unwrap(_initialEthPerFeeAsset);
    require(
      initialPrice >= MIN_ETH_PER_FEE_ASSET && initialPrice <= MAX_ETH_PER_FEE_ASSET,
      Errors.FeeLib__InvalidInitialEthPerFeeAsset(initialPrice, MIN_ETH_PER_FEE_ASSET, MAX_ETH_PER_FEE_ASSET)
    );

    feeState.config = FeeConfig({
        manaTarget: _manaTarget,
        congestionUpdateFraction: _manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR,
        provingCostPerMana: _provingCostPerMana
      }).compress();

    feeState.l1GasOracleValues = L1GasOracleValues({
      // Seed the oracle with a harmless historical value so the first checkpoints always have a valid
      // "pre" quote while the queued "post" value warms up.
      pre: L1FeeData({baseFee: 1 gwei, blobFee: 1}).compress(),
      post: L1FeeData({baseFee: block.basefee, blobFee: BlobLib.getBlobBaseFee()}).compress(),
      slotOfChange: LIFETIME.compress()
    });

    return
      FeeHeader({excessMana: 0, manaUsed: 0, ethPerFeeAsset: initialPrice, congestionCost: 0, proverCost: 0}).compress();
  }

  /**
   * @notice Writes a fee header into the checkpoint roundabout.
   * @param _checkpointNumber Checkpoint whose roundabout slot should be written.
   * @param _feeHeader Fee header to store.
   */
  function _writeFeeHeader(uint256 _checkpointNumber, FeeHeader memory _feeHeader) internal {
    feeState.feeHeaders[_feeHeaderSlot(_checkpointNumber)] = _feeHeader.compress();
  }

  /**
   * @notice Validates and stores a new reward configuration.
   * @dev Reverts when the sequencer reward split exceeds 100%.
   * @param _config Candidate reward configuration.
   */
  function _setRewardConfig(RewardConfig memory _config) internal {
    require(Bps.unwrap(_config.sequencerBps) <= 10_000, Errors.RewardLib__InvalidSequencerBps());
    rewardState.config = _config;
  }

  /**
   * @notice Validates and stores a new reward-booster configuration.
   * @dev Reverts when the saturated share value drops below the configured minimum floor.
   * @param _config Candidate reward-booster configuration.
   */
  function _setRewardBoostConfig(RewardBoostConfig memory _config) internal {
    require(_config.k >= _config.minimum, Errors.RewardLib__InvalidRewardBoostConfig(_config.minimum, _config.k));
    rewardState.boostConfig = _config;
  }

  /**
   * @notice Updates a prover's activity score and returns the resulting booster shares.
   * @dev Applies epoch decay, conditionally increments the stored score once per epoch, and returns
   *      the resulting reward shares.
   * @param _prover Prover whose score should be updated.
   * @return Shares derived from the updated activity score.
   */
  function _updateAndGetShares(address _prover) internal returns (uint256) {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    CompressedActivityScore storage store = rewardState.activityScores[_prover];
    ActivityScore memory current = _activityScoreAt(store, currentEpoch);

    if (current.time != store.time.decompress()) {
      store.value = Math.min(
          uint256(current.value) + rewardState.boostConfig.increment, rewardState.boostConfig.maxScore
        ).toUint32();
      store.time = current.time.compress();
    }

    return _toShares(store.value);
  }

  /**
   * @notice Settles checkpoint rewards and per-checkpoint fees for a new longest proof.
   * @dev This stays split out from `finalizeEpochSettlement(...)` because the loop and reward-split
   *      locals are enough to hit the stack limit when kept in the outer function.
   * @param _epochRewards Reward bucket for the settled epoch.
   * @param _start First checkpoint in the proven range.
   * @param _fees Flattened fee payload from the proof submission.
   * @param _length New longest proven prefix length.
   * @param _checkpointRewardsReceived Canonical checkpoint rewards received for this settlement.
   * @return totalBurn Total congestion fees burned across the newly settled prefix.
   */
  function _finalizeLongestProof(
    EpochRewards storage _epochRewards,
    uint256 _start,
    bytes32[] calldata _fees,
    uint256 _length,
    uint256 _checkpointRewardsReceived
  ) internal returns (uint256 totalBurn) {
    // Checkpoint rewards are split once per newly settled prefix. Per-checkpoint fee settlement is then
    // layered on top for the same range.
    uint256 sequencerCheckpointReward = _creditCheckpointRewards(_epochRewards, _length, _checkpointRewardsReceived);
    for (uint256 i = _epochRewards.longestProvenLength; i < _length; i++) {
      uint256 sequencerReward = sequencerCheckpointReward;
      (uint256 burn, uint256 proverFee, uint256 sequencerFee) = _settleCheckpointFees(_start + i, _fees[1 + i * 2]);
      totalBurn += burn;
      _epochRewards.rewards += proverFee.toUint128();
      sequencerReward += sequencerFee;

      if (sequencerReward > 0) {
        rewardState.sequencerRewards[address(uint160(uint256(_fees[i * 2])))] += sequencerReward;
      }
    }
  }

  /**
   * @notice Splits claimed checkpoint rewards between the sequencer side and prover pool.
   * @dev Any integer-division dust from the per-checkpoint sequencer split is routed back into the
   *      collective prover rewards so the full claimed amount stays accounted for.
   * @param _epochRewards Reward bucket for the settled epoch.
   * @param _length New longest proven prefix length.
   * @param _checkpointRewardsReceived Canonical checkpoint rewards received for this settlement.
   * @return sequencerCheckpointReward Per-checkpoint sequencer reward for the newly settled prefix.
   */
  function _creditCheckpointRewards(
    EpochRewards storage _epochRewards,
    uint256 _length,
    uint256 _checkpointRewardsReceived
  ) internal returns (uint256 sequencerCheckpointReward) {
    uint256 added = _length - _epochRewards.longestProvenLength;
    uint256 sequencerCheckpointRewards = BpsLib.mul(_checkpointRewardsReceived, rewardState.config.sequencerBps);

    // Integer division leaves dust on the sequencer side. Route that dust back to prover rewards so the
    // full claimed amount remains accounted for.
    sequencerCheckpointReward = sequencerCheckpointRewards / added;
    uint256 dust = sequencerCheckpointRewards - (sequencerCheckpointReward * added);
    uint256 proverCheckpointRewards = _checkpointRewardsReceived - sequencerCheckpointRewards + dust;
    if (proverCheckpointRewards > 0) {
      _epochRewards.rewards += proverCheckpointRewards.toUint128();
    }
  }

  /**
   * @notice Returns the stored compressed fee header for a checkpoint after validating availability.
   * @dev This uses STF-style window checks, but anchored to the checkpoint range ever recorded by this
   *      economics instance rather than the rollup's moving pending tip. All non-pricing reads go
   *      through this checked path so overwritten or foreign checkpoint slots fail closed.
   * @param _checkpointNumber Checkpoint whose fee header should be read.
   * @return Stored compressed fee header.
   */
  function _readCheckedFeeHeader(uint256 _checkpointNumber) internal view returns (CompressedFeeHeader) {
    uint256 firstRecordedCheckpoint = feeState.firstRecordedCheckpoint;
    uint256 highestRecordedCheckpoint = feeState.highestRecordedCheckpoint;
    uint256 upperLimit = _checkpointNumber + TimeLib.maxPrunableCheckpoints() + 1;

    bool available =
      highestRecordedCheckpoint != 0 && firstRecordedCheckpoint <= _checkpointNumber
      && _checkpointNumber <= highestRecordedCheckpoint && highestRecordedCheckpoint < upperLimit;
    require(
      available,
      Errors.Economics__UnavailableFeeHeader(
        _checkpointNumber, firstRecordedCheckpoint, highestRecordedCheckpoint, upperLimit
      )
    );

    return feeState.feeHeaders[_feeHeaderSlot(_checkpointNumber)];
  }

  /**
   * @notice Returns the storage slot for a checkpoint's fee header.
   * @dev The circular buffer is sized exactly like STF temp checkpoint storage so old fee headers
   *      are overwritten only after they are outside the proof/prune window.
   * @param _checkpointNumber Checkpoint whose roundabout slot should be addressed.
   * @return Storage slot index inside the fee-header roundabout.
   */
  function _feeHeaderSlot(uint256 _checkpointNumber) internal view returns (uint256) {
    return _checkpointNumber % (TimeLib.maxPrunableCheckpoints() + 1);
  }

  /**
   * @notice Returns the parent fee header used for pricing inside this economics model.
   * @dev A newly activated economics instance has no stored header for the previous global checkpoint.
   *      In that case, pricing starts from the model-local genesis header instead of reverting.
   *      This is the only place we intentionally bypass availability checks because the first local
   *      checkpoint after a cutover must still be quotable even though its parent lives in the old
   *      economics instance. The rollup constrains this unchecked path to proposal-time pricing:
   *      proposals are routed to the economics for the current epoch, and later settlement reads the
   *      stored checkpoint header through the checked path in `_settleCheckpointFees(...)`.
   * @param _checkpointNumber Parent checkpoint number to inspect.
   * @return Stored parent fee header, or the local genesis header when absent.
   */
  function _getPricingParentFeeHeader(uint256 _checkpointNumber) internal view returns (CompressedFeeHeader) {
    CompressedFeeHeader feeHeader = feeState.feeHeaders[_feeHeaderSlot(_checkpointNumber)];
    return CompressedFeeHeader.unwrap(feeHeader) == 0 ? GENESIS_FEE_HEADER : feeHeader;
  }

  /**
   * @notice Splits a checkpoint fee payment into burn, prover fee, and sequencer fee.
   * @param _checkpointNumber Checkpoint whose fee header determines the split.
   * @param _feeField Total fee payment encoded in the proof payload.
   * @return burn Congestion fee burned for the checkpoint.
   * @return proverFee Portion routed into prover rewards.
   * @return sequencerFee Portion credited to the sequencer.
   */
  function _settleCheckpointFees(uint256 _checkpointNumber, bytes32 _feeField)
    internal
    view
    returns (uint256 burn, uint256 proverFee, uint256 sequencerFee)
  {
    CompressedFeeHeader feeHeader = _readCheckedFeeHeader(_checkpointNumber);
    uint256 manaUsed = feeHeader.getManaUsed();
    uint256 fee = uint256(_feeField);

    burn = feeHeader.getCongestionCost() * manaUsed;
    require(fee >= burn, Errors.Economics__FeeBelowCongestionBurn(fee, burn));
    proverFee = Math.min(manaUsed * feeHeader.getProverCost(), fee - burn);
    sequencerFee = fee - burn - proverFee;
  }

  /**
   * @notice Computes the congestion multiplier applied to the base sequencer+prover price.
   * @dev We exponentiate the excess-mana ratio using the same fake-exponential scheme as EIP-4844.
   *      The exponent is capped at `100` to keep the Taylor series bounded; `e^100` is already far
   *      beyond any economically meaningful multiplier for this system.
   * @param _numerator Excess-mana numerator passed to the fake exponential.
   * @return Congestion multiplier scaled by `MINIMUM_CONGESTION_MULTIPLIER`.
   */
  function _congestionMultiplier(uint256 _numerator) internal view returns (uint256) {
    uint256 denominator = feeState.config.getCongestionUpdateFraction();
    uint256 cappedNumerator = Math.min(_numerator, denominator * 100);
    return _fakeExponential(MINIMUM_CONGESTION_MULTIPLIER, cappedNumerator, denominator);
  }

  /**
   * @notice Returns a prover's activity score after decaying it to `_epoch`.
   * @param _score Stored compressed activity score.
   * @param _epoch Epoch at which to evaluate the score.
   * @return Decayed activity score snapshot.
   */
  function _activityScoreAt(CompressedActivityScore storage _score, Epoch _epoch)
    internal
    view
    returns (ActivityScore memory)
  {
    uint256 decrease = (Epoch.unwrap(_epoch) - Epoch.unwrap(_score.time.decompress())) * 1e5;
    return
      ActivityScore({value: decrease > uint256(_score.value) ? 0 : _score.value - decrease.toUint32(), time: _epoch});
  }

  /**
   * @notice Converts an activity-score value into reward shares.
   * @dev Using `RewardBoostConfig`, the curve saturates at `k`, bottoms out at `minimum`, and
   *      otherwise returns `max(k - (a * t^2 / 1e10), minimum)` where
   *      `t = maxScore - value`.
   *      `setRewardBoostConfig(...)` and initialization enforce `k >= minimum` so the saturated path
   *      also respects that floor.
   * @param _value Activity-score value to convert.
   * @return Reward shares for the prover.
   */
  function _toShares(uint256 _value) internal view returns (uint256) {
    RewardBoostConfig memory config = rewardState.boostConfig;
    if (_value >= config.maxScore) {
      return config.k;
    }

    uint256 t = uint256(config.maxScore) - _value;
    uint256 rhs = uint256(config.a) * t * t / 1e10;
    if (uint256(config.k) < rhs) {
      return config.minimum;
    }

    return Math.max(uint256(config.k) - rhs, uint256(config.minimum));
  }

  /**
   * @notice Applies a bounded basis-point modifier to the fee-asset oracle price.
   * @dev `_modifierBps` is constrained to +/-1% by the caller and the result is clamped to the
   *      representable oracle range.
   * @param _currentPrice Current ETH-per-fee-asset price.
   * @param _modifierBps Basis-point modifier to apply.
   * @return Updated ETH-per-fee-asset price after clamping.
   */
  function _computeNewEthPerFeeAsset(uint256 _currentPrice, int256 _modifierBps) internal pure returns (uint256) {
    uint256 newPrice;
    if (_modifierBps >= 0) {
      newPrice = _currentPrice * (10_000 + uint256(_modifierBps)) / 10_000;
    } else {
      newPrice = _currentPrice * (10_000 - SignedMath.abs(_modifierBps)) / 10_000;
    }

    if (newPrice < MIN_ETH_PER_FEE_ASSET) return MIN_ETH_PER_FEE_ASSET;
    if (newPrice > MAX_ETH_PER_FEE_ASSET) return MAX_ETH_PER_FEE_ASSET;
    return newPrice;
  }

  /**
   * @notice Computes the checkpoint mana limit from the configured mana target.
   * @dev The model permits up to `2 * manaTarget` mana in a checkpoint. The result must fit in the
   *      compressed fee header, so anything above `uint32.max` is rejected.
   * @param _manaTarget Configured target mana per checkpoint.
   * @return Checkpoint mana limit implied by the target.
   */
  function _computeManaLimit(uint256 _manaTarget) internal pure returns (uint256) {
    require(_manaTarget > 0, Errors.Rollup__InvalidManaTarget(1, _manaTarget));
    uint256 manaLimit = _manaTarget * 2;
    require(manaLimit <= type(uint32).max, Errors.FeeLib__InvalidManaLimit(type(uint32).max, manaLimit));
    return manaLimit;
  }

  /**
   * @notice Adds a signed delta to a non-negative accumulator, clamping the result at zero.
   * @dev Used for running values such as excess mana that should decay but never underflow.
   * @param _a Current accumulator value.
   * @param _b Signed delta to apply.
   * @return Adjusted accumulator value clamped at zero.
   */
  function _clampedAdd(uint256 _a, int256 _b) internal pure returns (uint256) {
    if (_b >= 0) {
      return _a + _b.toUint256();
    }

    uint256 sub = SignedMath.abs(_b);
    if (_a > sub) {
      return _a - sub;
    }

    return 0;
  }

  /**
   * @notice Approximates `factor * e^(numerator / denominator)` using a Taylor expansion.
   * @dev This matches the fake-exponential construction used by EIP-4844.
   *
   *      Let `a = factor`, `x = numerator`, and `d = denominator`.
   *
   *      Then:
   *      `a * e^(x / d) = a
   *                    + a*x/d
   *                    + a*x^2/(2*d^2)
   *                    + a*x^3/(6*d^3)
   *                    + ...`
   *
   *      To keep the arithmetic in integers, we carry an extra factor of `d` through the running
   *      term and divide it out once at the end:
   *      `term_0 = a * d`
   *      `term_n = term_(n-1) * x / (d * n)`
   *      `sum = (term_0 + term_1 + term_2 + ...) / d`
   *
   *      The implementation stops once the next term truncates to zero.
   * @param _factor Initial scaling factor.
   * @param _numerator Exponent numerator.
   * @param _denominator Exponent denominator.
   * @return Integer approximation of `factor * e^(numerator / denominator)`.
   */
  function _fakeExponential(uint256 _factor, uint256 _numerator, uint256 _denominator) internal pure returns (uint256) {
    uint256 term = _factor * _denominator;
    uint256 sum = term;

    for (uint256 i = 1; term > 0; i++) {
      term = term * _numerator / (_denominator * i);
      sum += term;
    }

    return sum / _denominator;
  }
}
