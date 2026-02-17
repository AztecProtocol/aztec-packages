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
uint256 constant L1_GAS_PER_EPOCH_VERIFIED = 1_000_000;

uint256 constant MINIMUM_CONGESTION_MULTIPLIER = 1e9;

// The magic values are used to have the fakeExponential case where
// (numerator / denominator) is close to 0.117, as that leads to ~1.125 multiplier
// per increase by TARGET of the numerator;
uint256 constant MAGIC_CONGESTION_VALUE_DIVISOR = 1e8;
uint256 constant MAGIC_CONGESTION_VALUE_MULTIPLIER = 854_700_854;

uint256 constant BLOB_GAS_PER_BLOB = 2 ** 17;
uint256 constant BLOBS_PER_CHECKPOINT = 3;

struct OracleInput {
  int256 feeAssetPriceModifier;
}

struct ManaMinFeeComponents {
  uint256 congestionCost;
  uint256 congestionMultiplier;
  uint256 sequencerCost;
  uint256 proverCost;
}

struct FeeStore {
  CompressedFeeConfig config;
  L1GasOracleValues l1GasOracleValues;
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

    // Validate initial ETH per fee asset is within bounds
    uint256 initialPrice = EthPerFeeAssetE12.unwrap(_initialEthPerFeeAsset);
    require(
      initialPrice >= MIN_ETH_PER_FEE_ASSET && initialPrice <= MAX_ETH_PER_FEE_ASSET,
      Errors.FeeLib__InvalidInitialEthPerFeeAsset(initialPrice, MIN_ETH_PER_FEE_ASSET, MAX_ETH_PER_FEE_ASSET)
    );

    feeStore.config = FeeConfig({
        manaTarget: _manaTarget,
        congestionUpdateFraction: _manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR,
        provingCostPerMana: _provingCostPerMana
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
    config.provingCostPerMana = _provingCostPerMana;
    feeStore.config = config.compress();
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
    uint256 _congestionCost,
    uint256 _proverCost
  ) internal view returns (FeeHeader memory) {
    require(
      SignedMath.abs(_feeAssetPriceModifierBps) <= MAX_FEE_ASSET_PRICE_MODIFIER_BPS,
      Errors.FeeLib__InvalidFeeAssetPriceModifier()
    );
    CompressedFeeHeader parentFeeHeader = STFLib.getFeeHeader(_checkpointNumber - 1);
    // Use Math.max to handle checkpoints from ignition where ethPerFeeAsset may be 0
    uint256 parentEthPerFeeAsset = Math.max(parentFeeHeader.getEthPerFeeAsset(), MIN_ETH_PER_FEE_ASSET);
    return FeeHeader({
      excessMana: FeeLib.computeExcessMana(parentFeeHeader),
      ethPerFeeAsset: FeeLib.computeNewEthPerFeeAsset(parentEthPerFeeAsset, _feeAssetPriceModifierBps),
      manaUsed: _manaUsed,
      congestionCost: _congestionCost,
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

    if (manaTarget == 0) {
      return ManaMinFeeComponents({sequencerCost: 0, proverCost: 0, congestionCost: 0, congestionMultiplier: 0});
    }

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

    EthValue congestionCost =
    EthValue.wrap(
        Math.mulDiv(EthValue.unwrap(total), congestionMultiplier_, MINIMUM_CONGESTION_MULTIPLIER, Math.Rounding.Floor)
      ) - total;

    EthPerFeeAssetE12 ethPerFeeAsset = _inFeeAsset
      ? FeeLib.getEthPerFeeAssetAtCheckpoint(_checkpointOfInterest)
      : EthPerFeeAssetE12.wrap(ETH_PER_FEE_ASSET_PRECISION);

    return ManaMinFeeComponents({
      sequencerCost: FeeAssetValue.unwrap(sequencerCostPerMana.toFeeAsset(ethPerFeeAsset)),
      proverCost: FeeAssetValue.unwrap(proverCostPerMana.toFeeAsset(ethPerFeeAsset)),
      congestionCost: FeeAssetValue.unwrap(congestionCost.toFeeAsset(ethPerFeeAsset)),
      congestionMultiplier: congestionMultiplier_
    });
  }

  function isTxsEnabled() internal view returns (bool) {
    // If the target is 0, the limit is 0. And no transactions can enter
    return getManaTarget() > 0;
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

  function getEthPerFeeAssetAtCheckpoint(uint256 _checkpointNumber) internal view returns (EthPerFeeAssetE12) {
    uint256 value = STFLib.getFeeHeader(_checkpointNumber).getEthPerFeeAsset();
    // Ensure we never return 0 (e.g., from checkpoints proposed during ignition with manaTarget = 0)
    return EthPerFeeAssetE12.wrap(Math.max(value, MIN_ETH_PER_FEE_ASSET));
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
    return fakeExponential(MINIMUM_CONGESTION_MULTIPLIER, cappedNumerator, denominator);
  }

  function computeManaLimit(uint256 _manaTarget) internal pure returns (uint256) {
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
    return Math.min(_components.sequencerCost + _components.proverCost + _components.congestionCost, type(uint128).max);
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
