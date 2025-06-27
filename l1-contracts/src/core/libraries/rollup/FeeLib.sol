// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  L1FeeData,
  CompressedL1FeeData,
  L1GasOracleValues,
  FeeStructsLib,
  FeeHeader,
  CompressedFeeHeader,
  FeeHeaderLib
} from "@aztec/core/libraries/compressed-data/FeeStructs.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {SignedMath} from "@oz/utils/math/SignedMath.sol";
import {Errors} from "./../Errors.sol";
import {Slot, Timestamp, TimeLib} from "./../TimeLib.sol";
import {BlobLib} from "./BlobLib.sol";

// The lowest number of fee asset per eth is 10 with a precision of 1e9.
uint256 constant MINIMUM_FEE_ASSET_PER_ETH = 10e9;
uint256 constant MAX_FEE_ASSET_PRICE_MODIFIER = 1e6;
uint256 constant FEE_ASSET_PRICE_UPDATE_FRACTION = 100e6;

uint256 constant L1_GAS_PER_BLOCK_PROPOSED = 150000;
uint256 constant L1_GAS_PER_EPOCH_VERIFIED = 1000000;

uint256 constant MINIMUM_CONGESTION_MULTIPLIER = 1e9;

// The magic values are used to have the fakeExponential case where
// (numerator / denominator) is close to 0.117, as that leads to ~1.125 multiplier
// per increase by TARGET of the numerator;
uint256 constant MAGIC_CONGESTION_VALUE_DIVISOR = 1e8;
uint256 constant MAGIC_CONGESTION_VALUE_MULTIPLIER = 854700854;

uint256 constant BLOB_GAS_PER_BLOB = 2 ** 17;
uint256 constant GAS_PER_BLOB_POINT_EVALUATION = 50_000;
uint256 constant BLOBS_PER_BLOCK = 3;

struct OracleInput {
  int256 feeAssetPriceModifier;
}

struct ManaBaseFeeComponents {
  uint256 congestionCost;
  uint256 congestionMultiplier;
  uint256 sequencerCost;
  uint256 proverCost;
}

type EthValue is uint256;

type FeeAssetValue is uint256;

// Precision of 1e9
type FeeAssetPerEthE9 is uint256;

function addEthValue(EthValue _a, EthValue _b) pure returns (EthValue) {
  return EthValue.wrap(EthValue.unwrap(_a) + EthValue.unwrap(_b));
}

function subEthValue(EthValue _a, EthValue _b) pure returns (EthValue) {
  return EthValue.wrap(EthValue.unwrap(_a) - EthValue.unwrap(_b));
}

using {addEthValue as +, subEthValue as -} for EthValue global;

library PriceLib {
  function toEth(FeeAssetValue _feeAssetValue, FeeAssetPerEthE9 _feeAssetPerEth)
    internal
    pure
    returns (EthValue)
  {
    return EthValue.wrap(
      Math.mulDiv(
        FeeAssetValue.unwrap(_feeAssetValue),
        1e9,
        FeeAssetPerEthE9.unwrap(_feeAssetPerEth),
        Math.Rounding.Ceil
      )
    );
  }

  function toFeeAsset(EthValue _ethValue, FeeAssetPerEthE9 _feeAssetPerEth)
    internal
    pure
    returns (FeeAssetValue)
  {
    return FeeAssetValue.wrap(
      Math.mulDiv(
        EthValue.unwrap(_ethValue),
        FeeAssetPerEthE9.unwrap(_feeAssetPerEth),
        1e9,
        Math.Rounding.Ceil
      )
    );
  }
}

struct FeeStore {
  uint256 manaTarget;
  uint256 congestionUpdateFraction;
  EthValue provingCostPerMana;
  L1GasOracleValues l1GasOracleValues;
  mapping(uint256 blockNumber => CompressedFeeHeader feeHeader) feeHeaders;
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

  Slot internal constant LIFETIME = Slot.wrap(5);
  Slot internal constant LAG = Slot.wrap(2);

  bytes32 private constant FEE_STORE_POSITION = keccak256("aztec.fee.storage");

  function initialize(uint256 _manaTarget, EthValue _provingCostPerMana) internal {
    FeeStore storage feeStore = getStorage();

    feeStore.manaTarget = _manaTarget;
    feeStore.congestionUpdateFraction =
      _manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR;
    feeStore.provingCostPerMana = _provingCostPerMana;

    feeStore.l1GasOracleValues = L1GasOracleValues({
      pre: L1FeeData({baseFee: 1 gwei, blobFee: 1}).compress(),
      post: L1FeeData({baseFee: block.basefee, blobFee: BlobLib.getBlobBaseFee()}).compress(),
      slotOfChange: LIFETIME.compress()
    });
  }

  function updateManaTarget(uint256 _manaTarget) internal {
    FeeStore storage feeStore = getStorage();
    feeStore.manaTarget = _manaTarget;
    feeStore.congestionUpdateFraction =
      _manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR;
  }

  function writeFeeHeader(
    uint256 _blockNumber,
    int256 _feeAssetPriceModifier,
    uint256 _manaUsed,
    uint256 _congestionCost,
    uint256 _proverCost
  ) internal {
    require(
      SignedMath.abs(_feeAssetPriceModifier) <= MAX_FEE_ASSET_PRICE_MODIFIER,
      Errors.FeeLib__InvalidFeeAssetPriceModifier()
    );
    CompressedFeeHeader parentFeeHeader = getFeeHeader(_blockNumber - 1);
    setFeeHeader(
      _blockNumber,
      FeeHeader({
        excessMana: FeeLib.computeExcessMana(parentFeeHeader),
        feeAssetPriceNumerator: FeeLib.clampedAdd(
          parentFeeHeader.getFeeAssetPriceNumerator(), _feeAssetPriceModifier
        ),
        manaUsed: _manaUsed,
        congestionCost: _congestionCost,
        proverCost: _proverCost
      }).compress()
    );
  }

  function updateL1GasFeeOracle() internal {
    Slot slot = Timestamp.wrap(block.timestamp).slotFromTimestamp();
    // The slot where we find a new queued value acceptable
    FeeStore storage feeStore = getStorage();

    Slot acceptableSlot = feeStore.l1GasOracleValues.slotOfChange.decompress() + (LIFETIME - LAG);

    if (slot < acceptableSlot) {
      return;
    }

    feeStore.l1GasOracleValues.pre = feeStore.l1GasOracleValues.post;
    feeStore.l1GasOracleValues.post =
      L1FeeData({baseFee: block.basefee, blobFee: BlobLib.getBlobBaseFee()}).compress();
    feeStore.l1GasOracleValues.slotOfChange = (slot + LAG).compress();
  }

  function setFeeHeader(uint256 _blockNumber, CompressedFeeHeader _feeHeader) internal {
    // We only ever need the parent. However, because of the pruning, we cannot just drop it all.
    // We can however keep just enought to handle prunes, e.g., prunable + 1 so we have the parent
    uint256 roundabout = TimeLib.maxPrunableBlocks() + 1;
    getStorage().feeHeaders[_blockNumber % roundabout] = _feeHeader;
  }

  function preheatHeaders() internal {
    require(!getStorage().feeHeaders[0].isPreheated(), Errors.FeeLib__AlreadyPreheated());

    uint256 count = TimeLib.maxPrunableBlocks() + 1;
    for (uint256 i = 0; i < count; i++) {
      setFeeHeader(i, FeeHeaderLib.preheat(getFeeHeader(i)));
    }
  }

  function getFeeHeader(uint256 _blockNumber) internal view returns (CompressedFeeHeader) {
    uint256 roundabout = TimeLib.maxPrunableBlocks() + 1;
    return getStorage().feeHeaders[_blockNumber % roundabout];
  }

  function getL1FeesAt(Timestamp _timestamp) internal view returns (L1FeeData memory) {
    FeeStore storage feeStore = getStorage();
    return _timestamp.slotFromTimestamp() < feeStore.l1GasOracleValues.slotOfChange.decompress()
      ? feeStore.l1GasOracleValues.pre.decompress()
      : feeStore.l1GasOracleValues.post.decompress();
  }

  function getManaBaseFeeComponentsAt(
    uint256 _blockOfInterest,
    Timestamp _timestamp,
    bool _inFeeAsset
  ) internal view returns (ManaBaseFeeComponents memory) {
    FeeStore storage feeStore = getStorage();

    uint256 manaTarget = feeStore.manaTarget;

    if (manaTarget == 0) {
      return ManaBaseFeeComponents({
        sequencerCost: 0,
        proverCost: 0,
        congestionCost: 0,
        congestionMultiplier: 0
      });
    }

    EthValue sequencerCostPerMana;
    EthValue proverCostPerMana;
    EthValue total;

    {
      L1FeeData memory fees = FeeLib.getL1FeesAt(_timestamp);

      // Sequencer cost per mana
      {
        uint256 gasUsed =
          L1_GAS_PER_BLOCK_PROPOSED + BLOBS_PER_BLOCK * GAS_PER_BLOB_POINT_EVALUATION;
        uint256 ethUsed = gasUsed * fees.baseFee;
        ethUsed += (BLOBS_PER_BLOCK * BLOB_GAS_PER_BLOB * fees.blobFee);

        sequencerCostPerMana =
          EthValue.wrap(Math.mulDiv(ethUsed, 1, manaTarget, Math.Rounding.Ceil));
      }

      // Prover cost per mana
      {
        proverCostPerMana = EthValue.wrap(
          Math.mulDiv(
            Math.mulDiv(
              L1_GAS_PER_EPOCH_VERIFIED,
              fees.baseFee,
              TimeLib.getStorage().epochDuration,
              Math.Rounding.Ceil
            ),
            1,
            manaTarget,
            Math.Rounding.Ceil
          )
        ) + feeStore.provingCostPerMana;
      }

      total = sequencerCostPerMana + proverCostPerMana;
    }

    CompressedFeeHeader parentFeeHeader = getFeeHeader(_blockOfInterest);
    uint256 excessMana = FeeLib.clampedAdd(
      parentFeeHeader.getExcessMana() + parentFeeHeader.getManaUsed(), -int256(manaTarget)
    );
    uint256 congestionMultiplier_ = congestionMultiplier(excessMana);

    EthValue congestionCost = EthValue.wrap(
      Math.mulDiv(
        EthValue.unwrap(total),
        congestionMultiplier_,
        MINIMUM_CONGESTION_MULTIPLIER,
        Math.Rounding.Floor
      )
    ) - total;

    FeeAssetPerEthE9 feeAssetPrice =
      _inFeeAsset ? FeeLib.getFeeAssetPerEthAtBlock(_blockOfInterest) : FeeAssetPerEthE9.wrap(1e9);

    return ManaBaseFeeComponents({
      sequencerCost: FeeAssetValue.unwrap(sequencerCostPerMana.toFeeAsset(feeAssetPrice)),
      proverCost: FeeAssetValue.unwrap(proverCostPerMana.toFeeAsset(feeAssetPrice)),
      congestionCost: FeeAssetValue.unwrap(congestionCost.toFeeAsset(feeAssetPrice)),
      congestionMultiplier: congestionMultiplier_
    });
  }

  function getManaLimit() internal view returns (uint256) {
    FeeStore storage feeStore = getStorage();
    return feeStore.manaTarget * 2;
  }

  function getFeeAssetPerEthAtBlock(uint256 _blockNumber) internal view returns (FeeAssetPerEthE9) {
    return getFeeAssetPerEth(getFeeHeader(_blockNumber).getFeeAssetPriceNumerator());
  }

  function computeExcessMana(CompressedFeeHeader _feeHeader) internal view returns (uint256) {
    FeeStore storage feeStore = getStorage();
    return clampedAdd(
      _feeHeader.getExcessMana() + _feeHeader.getManaUsed(), -int256(feeStore.manaTarget)
    );
  }

  function congestionMultiplier(uint256 _numerator) internal view returns (uint256) {
    FeeStore storage feeStore = getStorage();
    return
      fakeExponential(MINIMUM_CONGESTION_MULTIPLIER, _numerator, feeStore.congestionUpdateFraction);
  }

  function getFeeAssetPerEth(uint256 _numerator) internal pure returns (FeeAssetPerEthE9) {
    return FeeAssetPerEthE9.wrap(
      fakeExponential(MINIMUM_FEE_ASSET_PER_ETH, _numerator, FEE_ASSET_PRICE_UPDATE_FRACTION)
    );
  }

  function summedBaseFee(ManaBaseFeeComponents memory _components) internal pure returns (uint256) {
    return _components.sequencerCost + _components.proverCost + _components.congestionCost;
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
  function fakeExponential(uint256 _factor, uint256 _numerator, uint256 _denominator)
    private
    pure
    returns (uint256)
  {
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
