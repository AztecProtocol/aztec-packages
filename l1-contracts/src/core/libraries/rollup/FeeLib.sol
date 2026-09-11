// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BlobLib} from "@aztec-blob-lib/BlobLib.sol";
import {
  EthValue,
  FeeAssetValue,
  EthPerFeeAssetE12,
  ETH_PER_FEE_ASSET_PRECISION,
  CompressedFeeConfig,
  FeeConfigLib,
  FeeConfig,
  PriceLib
} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {
  L1FeeData,
  CompressedL1FeeData,
  L1GasOracleValues,
  FeeStructsLib,
  FeeHeader,
  CompressedFeeHeader,
  FeeHeaderLib
} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {SignedMath} from "@oz/utils/math/SignedMath.sol";
import {Errors} from "./../Errors.sol";
import {Slot, Timestamp, TimeLib} from "./../TimeLib.sol";
import {STFLib} from "./STFLib.sol";

/*
 * Fee Asset Price Oracle Constants
 *
 * The fee asset price is stored as `ethPerFeeAsset` with 1e12 precision (ETH_PER_FEE_ASSET_PRECISION).
 *
 * We use 1e12 precision because:
 * 1. The value must fit in 48 bits when compressed (max ~2.8e14), and 1e12 provides good headroom
 * 2. Higher precision allows representing very low prices without losing granularity
 * 3. Reduces rounding errors during ETH <-> FeeAsset conversions
 *
 * The oracle can modify the price by up to ±1% per checkpoint via a basis points modifier.
 * To ensure integer math works correctly (1% of X always changes X by at least 1), we set MIN = 100.
 *
 * Price range (ETH per AZTEC):
 * - MIN (100): 1e-10 ETH per AZTEC (effectively worthless)
 * - MAX (1e14): 100 ETH per AZTEC
 */

// Minimum ETH per fee asset (1e-10 ETH/AZTEC). Set to 100 so 1% always moves by at least 1.
uint256 constant MIN_ETH_PER_FEE_ASSET = 100;

// Maximum ETH per fee asset (100 ETH/AZTEC).
uint256 constant MAX_ETH_PER_FEE_ASSET = 1e14;

// Maximum price modifier per checkpoint in basis points. ±100 bps = ±1%.
uint256 constant MAX_FEE_ASSET_PRICE_MODIFIER_BPS = 100;

uint256 constant L1_GAS_PER_CHECKPOINT_PROPOSED = 300_000;
uint256 constant L1_GAS_PER_EPOCH_VERIFIED = 3_600_000;

// The uncongested baseline of the congestion multiplier is (1 + mu) * 1e9, where mu is the
// protocol fee margin: congestionMultiplier scales this minimum by (10_000 + marginBps) / 10_000.
// At a margin of 0 the baseline is exactly 1e9.
uint256 constant MINIMUM_CONGESTION_MULTIPLIER = 1e9;

// The magic values are used to have the fakeExponential case where
// (numerator / denominator) is close to 0.117, as that leads to ~1.125 multiplier
// per increase by TARGET of the numerator;
uint256 constant MAGIC_CONGESTION_VALUE_DIVISOR = 1e8;
uint256 constant MAGIC_CONGESTION_VALUE_MULTIPLIER = 854_700_854;

uint256 constant BLOB_GAS_PER_BLOB = 2 ** 17;
uint256 constant BLOBS_PER_CHECKPOINT = 3;

/*
 * Proving-cost rate limit
 *
 * `setProvingCostPerMana` can move the rollup's fee model materially, so the value is
 * constrained to a bounded multiplicative step per cooldown instead of unconstrained writes.
 *
 *   - PROVING_COST_UPDATE_INTERVAL: minimum time between updates (acts as the anti-multicall guard).
 *   - PROVING_COST_STEP_NUM / _DEN: multiplicative step cap applied against the live value.
 *   - MIN_PROVING_COST_PER_MANA: floor that keeps the ratio algebra useful (0 and 1 freeze).
 *
 * With 3/2 per 30 days, the value requires ~170 days to move 10x and ~340 days to move 100x.
 * `provingCostLastUpdate == 0` after `initialize`, so the first post-init update is not gated
 * by the cooldown; the 30-day cadence engages after that.
 */
uint256 constant PROVING_COST_UPDATE_INTERVAL = 30 days;
uint256 constant PROVING_COST_STEP_NUM = 3;
uint256 constant PROVING_COST_STEP_DEN = 2;
uint256 constant MIN_PROVING_COST_PER_MANA = 2;
// Initial-only ceiling. Prevents a mistaken deployment from setting a value that will take a long
// time to correct from. At the time of this writing, deployed value is 2.5e7, and it is expected
// that proving costs will go down.
uint256 constant MAX_INITIAL_PROVING_COST_PER_MANA = 2e8;

/*
 * Protocol-fee-margin rate limit
 *
 * `setProtocolFeeMargin` multiplies the fee users pay, so increases are constrained to a bounded
 * multiplicative step per cooldown, mirroring the proving-cost limiter above. The bounded quantity
 * is the fee multiplier (10_000 + marginBps), not the margin itself, so each step raises the
 * pinned fee by at most x3/2. Decreases are immediate and unrestricted (floor 0 is structural via
 * uint16). `protocolMarginLastUpdate == 0` after `initialize`, so the first post-init update is
 * not gated by the cooldown; the 30-day cadence engages after that (decreases stamp it too).
 */
uint256 constant PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL = 30 days;
uint256 constant PROTOCOL_FEE_MARGIN_STEP_NUM = 3;
uint256 constant PROTOCOL_FEE_MARGIN_STEP_DEN = 2;

struct OracleInput {
  int256 feeAssetPriceModifier;
}

struct ManaMinFeeComponents {
  uint256 protocolFee;
  uint256 congestionMultiplier;
  uint256 sequencerCost;
  uint256 proverCost;
}

struct FeeStore {
  CompressedFeeConfig config;
  L1GasOracleValues l1GasOracleValues;
  uint64 provingCostLastUpdate;
  uint64 protocolMarginLastUpdate;
}

library FeeLib {
  using Math for uint256;
  using SafeCast for int256;
  using SafeCast for uint256;
  using SignedMath for int256;
  using PriceLib for EthValue;
  using TimeLib for Slot;
  using TimeLib for Timestamp;

  using FeeHeaderLib for FeeHeader;
  using FeeHeaderLib for CompressedFeeHeader;
  using CompressedTimeMath for CompressedSlot;
  using CompressedTimeMath for Slot;

  using FeeStructsLib for L1FeeData;
  using FeeStructsLib for CompressedL1FeeData;
  using FeeConfigLib for FeeConfig;
  using FeeConfigLib for CompressedFeeConfig;

  Slot internal constant LIFETIME = Slot.wrap(5);
  Slot internal constant LAG = Slot.wrap(2);

  bytes32 private constant FEE_STORE_POSITION = keccak256("aztec.fee.storage");

  function initialize(uint256 _manaTarget, EthValue _provingCostPerMana, EthPerFeeAssetE12 _initialEthPerFeeAsset)
    internal
  {
    FeeStore storage feeStore = getStorage();

    // Computes and ensures that limit is within sane bounds
    computeManaLimit(_manaTarget);

    // The rate-limit algebra in updateProvingCostPerMana assumes `current >= 2`; initializing
    // below the floor would permanently freeze the proving-cost update path.
    uint256 provingCost = EthValue.unwrap(_provingCostPerMana);
    require(
      provingCost >= MIN_PROVING_COST_PER_MANA,
      Errors.FeeLib__ProvingCostBelowFloor(provingCost, MIN_PROVING_COST_PER_MANA)
    );
    // The uint64 cap inside FeeConfigLib.compress is a storage-shape bound, not an economic
    // bound. Enforce a separate initial ceiling so a deploy cannot strand the rollup at a value
    // that takes years to drift back to normal operating ranges via the rate-limited updater.
    require(
      provingCost <= MAX_INITIAL_PROVING_COST_PER_MANA,
      Errors.FeeLib__ProvingCostAboveCeiling(provingCost, MAX_INITIAL_PROVING_COST_PER_MANA)
    );

    // Validate initial ETH per fee asset is within bounds
    uint256 initialPrice = EthPerFeeAssetE12.unwrap(_initialEthPerFeeAsset);
    require(
      initialPrice >= MIN_ETH_PER_FEE_ASSET && initialPrice <= MAX_ETH_PER_FEE_ASSET,
      Errors.FeeLib__InvalidInitialEthPerFeeAsset(initialPrice, MIN_ETH_PER_FEE_ASSET, MAX_ETH_PER_FEE_ASSET)
    );

    feeStore.config = FeeConfig({
        manaTarget: _manaTarget,
        congestionUpdateFraction: _manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR,
        provingCostPerMana: _provingCostPerMana,
        protocolFeeMarginBps: 0
      }).compress();

    feeStore.l1GasOracleValues = L1GasOracleValues({
      pre: L1FeeData({baseFee: 1 gwei, blobFee: 1}).compress(),
      post: L1FeeData({baseFee: block.basefee, blobFee: BlobLib.getBlobBaseFee()}).compress(),
      slotOfChange: LIFETIME.compress()
    });

    // Write the initial ethPerFeeAsset to checkpoint 0's fee header
    STFLib.writeGenesisFeeHeader(EthPerFeeAssetE12.unwrap(_initialEthPerFeeAsset));
  }

  function updateManaTarget(uint256 _manaTarget) internal {
    // Computes and ensures that limit is within sane bounds
    computeManaLimit(_manaTarget);

    FeeStore storage feeStore = getStorage();

    FeeConfig memory config = feeStore.config.decompress();
    config.manaTarget = _manaTarget;
    config.congestionUpdateFraction = _manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR;

    feeStore.config = config.compress();
  }

  function updateProvingCostPerMana(EthValue _provingCostPerMana) internal {
    FeeStore storage feeStore = getStorage();
    FeeConfig memory config = feeStore.config.decompress();

    uint256 current = EthValue.unwrap(config.provingCostPerMana);
    uint256 newV = EthValue.unwrap(_provingCostPerMana);

    require(newV >= MIN_PROVING_COST_PER_MANA, Errors.FeeLib__ProvingCostBelowFloor(newV, MIN_PROVING_COST_PER_MANA));

    uint256 nextAllowed = uint256(feeStore.provingCostLastUpdate) + PROVING_COST_UPDATE_INTERVAL;
    require(
      feeStore.provingCostLastUpdate == 0 || block.timestamp >= nextAllowed,
      Errors.FeeLib__ProvingCostCooldown(nextAllowed)
    );

    require(
      newV * PROVING_COST_STEP_DEN <= current * PROVING_COST_STEP_NUM
        && newV * PROVING_COST_STEP_NUM >= current * PROVING_COST_STEP_DEN,
      Errors.FeeLib__ProvingCostStepExceeded(current, newV)
    );

    config.provingCostPerMana = _provingCostPerMana;
    feeStore.config = config.compress();
    feeStore.provingCostLastUpdate = uint64(block.timestamp);
  }

  /**
   * @notice Updates the protocol fee margin (in basis points) applied on top of operator cost.
   * @dev Idempotent: setting the current value is a no-op (no state change, no cooldown stamp).
   *      Increases are gated by the 30-day cooldown (first-ever update exempt) and the x3/2 step
   *      on the fee multiplier `(10_000 + bps)`. Decreases are immediate and unrestricted but
   *      still stamp the cooldown. The uint16 parameter makes values above 65535 unrepresentable
   *      at the ABI boundary, so the reverting `toUint16` inside `compress` can never fire from
   *      this path and later `compress` round-trips (updateManaTarget, updateProvingCostPerMana)
   *      never see an out-of-range margin.
   * @param _bps The new protocol fee margin in basis points
   * @return changed Whether state was mutated (false for the idempotent no-op)
   * @return oldBps The margin in effect before this call
   */
  function updateProtocolFeeMargin(uint16 _bps) internal returns (bool changed, uint16 oldBps) {
    FeeStore storage feeStore = getStorage();
    FeeConfig memory config = feeStore.config.decompress();

    oldBps = uint16(config.protocolFeeMarginBps);

    if (_bps == oldBps) {
      return (false, oldBps);
    }

    if (_bps > oldBps) {
      uint256 nextAllowed = uint256(feeStore.protocolMarginLastUpdate) + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL;
      require(
        feeStore.protocolMarginLastUpdate == 0 || block.timestamp >= nextAllowed,
        Errors.FeeLib__ProtocolFeeMarginCooldown(nextAllowed)
      );
      require(
        (10_000 + uint256(_bps)) * PROTOCOL_FEE_MARGIN_STEP_DEN
          <= (10_000 + uint256(oldBps)) * PROTOCOL_FEE_MARGIN_STEP_NUM,
        Errors.FeeLib__ProtocolFeeMarginStepExceeded(oldBps, _bps)
      );
    }

    config.protocolFeeMarginBps = _bps;
    feeStore.config = config.compress();
    feeStore.protocolMarginLastUpdate = uint64(block.timestamp);

    return (true, oldBps);
  }

  function updateL1GasFeeOracle() internal {
    Slot slot = Timestamp.wrap(block.timestamp).slotFromTimestamp();
    // The slot where we find a new queued value acceptable
    FeeStore storage feeStore = getStorage();

    Slot acceptableSlot = feeStore.l1GasOracleValues.slotOfChange.decompress() + (LIFETIME - LAG);

    if (slot < acceptableSlot) {
      return;
    }

    feeStore.l1GasOracleValues = L1GasOracleValues({
      pre: feeStore.l1GasOracleValues.post,
      post: L1FeeData({baseFee: block.basefee, blobFee: BlobLib.getBlobBaseFee()}).compress(),
      slotOfChange: (slot + LAG).compress()
    });
  }

  function computeFeeHeader(
    uint256 _checkpointNumber,
    int256 _feeAssetPriceModifierBps,
    uint256 _manaUsed,
    uint256 _protocolFee,
    uint256 _proverCost
  ) internal view returns (FeeHeader memory) {
    require(
      SignedMath.abs(_feeAssetPriceModifierBps) <= MAX_FEE_ASSET_PRICE_MODIFIER_BPS,
      Errors.FeeLib__InvalidFeeAssetPriceModifier()
    );
    CompressedFeeHeader parentFeeHeader = STFLib.getFeeHeader(_checkpointNumber - 1);
    return FeeHeader({
      excessMana: FeeLib.computeExcessMana(parentFeeHeader),
      ethPerFeeAsset: FeeLib.computeNewEthPerFeeAsset(parentFeeHeader.getEthPerFeeAsset(), _feeAssetPriceModifierBps),
      manaUsed: _manaUsed,
      protocolFee: _protocolFee,
      proverCost: _proverCost
    });
  }

  function getL1FeesAt(Timestamp _timestamp) internal view returns (L1FeeData memory) {
    FeeStore storage feeStore = getStorage();
    return _timestamp.slotFromTimestamp() < feeStore.l1GasOracleValues.slotOfChange.decompress()
      ? feeStore.l1GasOracleValues.pre.decompress()
      : feeStore.l1GasOracleValues.post.decompress();
  }

  function getManaMinFeeComponentsAt(uint256 _checkpointOfInterest, Timestamp _timestamp, bool _inFeeAsset)
    internal
    view
    returns (ManaMinFeeComponents memory)
  {
    FeeStore storage feeStore = getStorage();

    uint256 manaTarget = feeStore.config.getManaTarget();

    EthValue sequencerCostPerMana;
    EthValue proverCostPerMana;
    EthValue total;

    {
      L1FeeData memory fees = FeeLib.getL1FeesAt(_timestamp);

      // Sequencer cost per mana
      {
        uint256 ethUsed =
          (L1_GAS_PER_CHECKPOINT_PROPOSED * fees.baseFee) + (BLOBS_PER_CHECKPOINT * BLOB_GAS_PER_BLOB * fees.blobFee);

        sequencerCostPerMana = EthValue.wrap(Math.mulDiv(ethUsed, 1, manaTarget, Math.Rounding.Ceil));
      }

      // Prover cost per mana
      {
        proverCostPerMana = EthValue.wrap(
            Math.mulDiv(
              Math.mulDiv(
                L1_GAS_PER_EPOCH_VERIFIED, fees.baseFee, TimeLib.getStorage().epochDuration, Math.Rounding.Ceil
              ),
              1,
              manaTarget,
              Math.Rounding.Ceil
            )
          ) + feeStore.config.getProvingCostPerMana();
      }

      total = sequencerCostPerMana + proverCostPerMana;
    }

    CompressedFeeHeader parentFeeHeader = STFLib.getFeeHeader(_checkpointOfInterest);
    uint256 excessMana =
      FeeLib.clampedAdd(parentFeeHeader.getExcessMana() + parentFeeHeader.getManaUsed(), -int256(manaTarget));
    uint256 congestionMultiplier_ = congestionMultiplier(excessMana);

    EthValue protocolFee =
    EthValue.wrap(
        Math.mulDiv(EthValue.unwrap(total), congestionMultiplier_, MINIMUM_CONGESTION_MULTIPLIER, Math.Rounding.Floor)
      ) - total;

    EthPerFeeAssetE12 ethPerFeeAsset = _inFeeAsset
      ? FeeLib.getEthPerFeeAssetAtCheckpoint(_checkpointOfInterest)
      : EthPerFeeAssetE12.wrap(ETH_PER_FEE_ASSET_PRECISION);

    return ManaMinFeeComponents({
      sequencerCost: FeeAssetValue.unwrap(sequencerCostPerMana.toFeeAsset(ethPerFeeAsset)),
      proverCost: FeeAssetValue.unwrap(proverCostPerMana.toFeeAsset(ethPerFeeAsset)),
      protocolFee: FeeAssetValue.unwrap(protocolFee.toFeeAsset(ethPerFeeAsset)),
      congestionMultiplier: congestionMultiplier_
    });
  }

  function getManaTarget() internal view returns (uint256) {
    return getStorage().config.getManaTarget();
  }

  function getManaLimit() internal view returns (uint256) {
    FeeStore storage feeStore = getStorage();
    return computeManaLimit(feeStore.config.getManaTarget());
  }

  function getProvingCostPerMana() internal view returns (EthValue) {
    return getStorage().config.getProvingCostPerMana();
  }

  function getProtocolFeeMarginBps() internal view returns (uint16) {
    return uint16(getStorage().config.getProtocolFeeMarginBps());
  }

  function getEthPerFeeAssetAtCheckpoint(uint256 _checkpointNumber) internal view returns (EthPerFeeAssetE12) {
    return EthPerFeeAssetE12.wrap(STFLib.getFeeHeader(_checkpointNumber).getEthPerFeeAsset());
  }

  function computeExcessMana(CompressedFeeHeader _feeHeader) internal view returns (uint256) {
    FeeStore storage feeStore = getStorage();
    return clampedAdd(_feeHeader.getExcessMana() + _feeHeader.getManaUsed(), -int256(feeStore.config.getManaTarget()));
  }

  function congestionMultiplier(uint256 _numerator) internal view returns (uint256) {
    FeeStore storage feeStore = getStorage();
    uint256 denominator = feeStore.config.getCongestionUpdateFraction();
    // Cap the exponent to prevent overflow in the Taylor series.
    // At e^100, the multiplier is ~2.69e43 * MINIMUM_CONGESTION_MULTIPLIER, more than enough
    uint256 cappedNumerator = Math.min(_numerator, denominator * 100);
    // The protocol fee margin scales only this factor: (10_000 + bps) * 1e5 == (1 + mu) * 1e9,
    // exactly 1e9 (== MINIMUM_CONGESTION_MULTIPLIER) at mu = 0. The mulDiv divisor in
    // getManaMinFeeComponentsAt MUST stay MINIMUM_CONGESTION_MULTIPLIER — scaling both sites
    // cancels the margin.
    return fakeExponential((10_000 + feeStore.config.getProtocolFeeMarginBps()) * 1e5, cappedNumerator, denominator);
  }

  function computeManaLimit(uint256 _manaTarget) internal pure returns (uint256) {
    require(_manaTarget > 0, Errors.FeeLib__InvalidManaTarget(1, _manaTarget));
    uint256 manaLimit = _manaTarget * 2;

    // Ensure that the maximum spent mana can fit in the fee header
    require(manaLimit <= type(uint32).max, Errors.FeeLib__InvalidManaLimit(type(uint32).max, manaLimit));

    return manaLimit;
  }

  /**
   * @notice  Compute new ETH per fee asset price based on percentage modifier
   * @param _currentPrice The current price (ETH per fee asset with 1e12 precision)
   * @param _modifierBps The modifier in basis points (-100 to +100 for ±1%)
   * @return The new price clamped to [MIN_ETH_PER_FEE_ASSET, MAX_ETH_PER_FEE_ASSET]
   */
  function computeNewEthPerFeeAsset(uint256 _currentPrice, int256 _modifierBps) internal pure returns (uint256) {
    uint256 newPrice;
    if (_modifierBps >= 0) {
      newPrice = _currentPrice * (10_000 + uint256(_modifierBps)) / 10_000;
    } else {
      newPrice = _currentPrice * (10_000 - SignedMath.abs(_modifierBps)) / 10_000;
    }

    // Clamp to bounds
    if (newPrice < MIN_ETH_PER_FEE_ASSET) return MIN_ETH_PER_FEE_ASSET;
    if (newPrice > MAX_ETH_PER_FEE_ASSET) return MAX_ETH_PER_FEE_ASSET;
    return newPrice;
  }

  function summedMinFee(ManaMinFeeComponents memory _components) internal pure returns (uint256) {
    // Cap at uint128 max to ensure the fee can always be represented in the proposal header's
    // feePerL2Gas field (uint128). Without this cap, extreme congestion or parameter combinations
    // could produce fees that no valid header can represent, causing a liveness failure.
    return Math.min(_components.sequencerCost + _components.proverCost + _components.protocolFee, type(uint128).max);
  }

  /**
   * @notice The per-mana protocol fee written to the fee header: the pinned fee minus the two
   *         converted operator costs, as one subtraction.
   * @dev The single subtraction guarantees `fee - protocolFee == cost * manaUsed` holds exactly
   *      in the reward waterfall; converting the margin and congestion tranches separately could
   *      drift by a wei because the Ceil conversion is not additive. The subtraction can go
   *      negative only when the uint128 cap in {summedMinFee} binds, in which case the protocol
   *      fee is clamped to 0 and operators stay whole.
   * @param _components The mana min fee components (in fee asset)
   * @return The per-mana protocol fee
   */
  function protocolFeePerMana(ManaMinFeeComponents memory _components) internal pure returns (uint256) {
    uint256 manaMinFee = summedMinFee(_components);
    uint256 operatorCost = _components.sequencerCost + _components.proverCost;
    return manaMinFee > operatorCost ? manaMinFee - operatorCost : 0;
  }

  function getStorage() internal pure returns (FeeStore storage storageStruct) {
    bytes32 position = FEE_STORE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }

  /**
   * @notice  Clamps the addition of a signed integer to a uint256
   *          Useful for running values, whose minimum value will be 0
   *          but should not throw if going below.
   * @param _a The base value
   * @param _b The value to add
   * @return The clamped value
   */
  function clampedAdd(uint256 _a, int256 _b) internal pure returns (uint256) {
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
   * @notice An approximation of the exponential function: factor * e ** (numerator / denominator)
   *
   *         The function is the same as used in EIP-4844
   *         https://github.com/ethereum/EIPs/blob/master/EIPS/eip-4844.md
   *
   *         Approximated using a taylor series.
   *         For shorthand below, let `a = factor`, `x = numerator`, `d = denominator`
   *
   *         f(x) =  a
   *              + (a * x) / d
   *              + (a * x ** 2) / (2 * d ** 2)
   *              + (a * x ** 3) / (6 * d ** 3)
   *              + (a * x ** 4) / (24 * d ** 4)
   *              + (a * x ** 5) / (120 * d ** 5)
   *              + ...
   *
   *         For integer precision purposes, we will multiply by the denominator for intermediary steps and then
   *         finally do a division by it.
   *         The notation below might look slightly strange, but it is to try to convey the program flow below.
   *
   *         e(x) = (          a * d
   *                 +         a * d * x / d
   *                 +       ((a * d * x / d) * x) / (2 * d)
   *                 +     ((((a * d * x / d) * x) / (2 * d)) * x) / (3 * d)
   *                 +   ((((((a * d * x / d) * x) / (2 * d)) * x) / (3 * d)) * x) / (4 * d)
   *                 + ((((((((a * d * x / d) * x) / (2 * d)) * x) / (3 * d)) * x) / (4 * d)) * x) / (5 * d)
   *                 + ...
   *                 ) / d
   *
   *         The notation might make it a bit of a pain to look at, but f(x) and e(x) are the same.
   *         Gotta love integer math.
   *
   * @dev   Notice that as _numerator grows, the computation will quickly overflow.
   *        As long as the `_denominator` is fairly small, it won't bring us back down to not overflow
   *        For our purposes, this is acceptable, as if we have a fee that is so high that it would overflow and throw
   *        then we would have other problems.
   *
   * @param _factor The base value
   * @param _numerator The numerator
   * @param _denominator The denominator
   * @return The approximated value `_factor * e ** (_numerator / _denominator)`
   */
  function fakeExponential(uint256 _factor, uint256 _numerator, uint256 _denominator) private pure returns (uint256) {
    uint256 i = 1;
    uint256 output = 0;
    uint256 numeratorAccumulator = _factor * _denominator;
    while (numeratorAccumulator > 0) {
      output += numeratorAccumulator;
      numeratorAccumulator = (numeratorAccumulator * _numerator) / (_denominator * i);
      i += 1;
    }
    return output / _denominator;
  }
}
