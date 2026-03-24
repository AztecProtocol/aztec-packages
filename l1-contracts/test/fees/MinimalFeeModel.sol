// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestConstants} from "../harnesses/TestConstants.sol";
import {
  ManaMinFeeComponentsModel,
  L1FeesModel,
  L1GasOracleValuesModel,
  FeeHeaderModel
} from "./FeeModelTestPoints.t.sol";
import {Vm} from "forge-std/Vm.sol";
import {Timestamp, Slot, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {EthValue, EthPerFeeAssetE12} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {
  CompressedL1FeeData,
  FeeHeader,
  FeeStructsLib,
  L1FeeData,
  L1GasOracleValues
} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {EconomicsInitArgs, ManaMinFeeComponents, OracleInput} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";

contract MinimalFeeModel {
  using FeeStructsLib for L1GasOracleValues;
  using FeeStructsLib for CompressedL1FeeData;
  using TimeLib for Timestamp;

  Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  uint256 internal constant MANA_TARGET = TestConstants.AZTEC_MANA_TARGET;

  EthPerFeeAssetE12 internal immutable INITIAL_ETH_PER_FEE_ASSET;
  uint256 public populatedThrough;
  EconomicsHarness internal economics;

  constructor(
    uint256 _slotDuration,
    uint256 _epochDuration,
    uint256 _proofSubmissionEpochs,
    EthPerFeeAssetE12 _initialEthPerFeeAsset
  ) {
    INITIAL_ETH_PER_FEE_ASSET = _initialEthPerFeeAsset;
    economics = new EconomicsHarness(
      address(this),
      address(this),
      IERC20(address(0)),
      EconomicsInitArgs({
        manaTarget: MANA_TARGET,
        provingCostPerMana: EthValue.wrap(100),
        initialEthPerFeeAsset: _initialEthPerFeeAsset,
        rewardConfig: TestConstants.getRewardConfig(),
        rewardBoostConfig: TestConstants.getRewardBoostConfig(),
        genesisTime: block.timestamp,
        aztecSlotDuration: _slotDuration,
        aztecEpochDuration: _epochDuration,
        aztecProofSubmissionEpochs: _proofSubmissionEpochs
      })
    );
  }

  function getL1GasOracleValues() public view returns (L1GasOracleValuesModel memory) {
    L1GasOracleValues memory values = economics.getL1GasOracleValues();
    return L1GasOracleValuesModel({
      pre: L1FeesModel({base_fee: values.pre.getBaseFee(), blob_fee: values.pre.getBlobFee()}),
      post: L1FeesModel({base_fee: values.post.getBaseFee(), blob_fee: values.post.getBlobFee()}),
      slot_of_change: Slot.unwrap(CompressedTimeMath.decompress(values.slotOfChange))
    });
  }

  function manaMinFeeComponents(bool _inFeeAsset) public view returns (ManaMinFeeComponentsModel memory) {
    ManaMinFeeComponents memory components =
      economics.getManaMinFeeComponentsAt(populatedThrough, Timestamp.wrap(block.timestamp), _inFeeAsset);

    return ManaMinFeeComponentsModel({
      congestion_cost: components.congestionCost,
      congestion_multiplier: components.congestionMultiplier,
      prover_cost: components.proverCost,
      sequencer_cost: components.sequencerCost
    });
  }

  function getFeeHeader(uint256 _checkpointNumber) public view returns (FeeHeaderModel memory) {
    FeeHeader memory feeHeader = economics.getFeeHeader(_checkpointNumber);
    return FeeHeaderModel({
      eth_per_fee_asset: feeHeader.ethPerFeeAsset, excess_mana: feeHeader.excessMana, mana_used: feeHeader.manaUsed
    });
  }

  function getPricingParentFeeHeader(uint256 _checkpointNumber) public view returns (FeeHeaderModel memory) {
    if (_checkpointNumber == 0) {
      return FeeHeaderModel({
        eth_per_fee_asset: EthPerFeeAssetE12.unwrap(INITIAL_ETH_PER_FEE_ASSET), excess_mana: 0, mana_used: 0
      });
    }

    return getFeeHeader(_checkpointNumber);
  }

  function addSlot(OracleInput memory _oracleInput) public {
    addSlot(_oracleInput, 0);
  }

  function addSlot(OracleInput memory _oracleInput, uint256 _manaUsed) public {
    uint256 checkpointNumber = ++populatedThrough;
    economics.recordCheckpoint({
      _checkpointNumber: checkpointNumber,
      _feeAssetPriceModifier: _oracleInput.feeAssetPriceModifier,
      _manaUsed: _manaUsed,
      _congestionCost: 0,
      _proverCost: 0
    });
  }

  function setProvingCost(EthValue _provingCost) public {
    economics.updateProvingCostPerMana(_provingCost);
  }

  function photograph() public {
    economics.updateL1GasFeeOracle();
  }

  function getEthPerFeeAsset() public view returns (EthPerFeeAssetE12) {
    return populatedThrough == 0
      ? INITIAL_ETH_PER_FEE_ASSET
      : EthPerFeeAssetE12.wrap(economics.getFeeHeader(populatedThrough).ethPerFeeAsset);
  }

  function getCurrentL1Fees() public view returns (L1FeesModel memory) {
    L1FeeData memory fees = economics.getL1FeesAt(Timestamp.wrap(block.timestamp));
    return L1FeesModel({base_fee: fees.baseFee, blob_fee: fees.blobFee});
  }

  function getCurrentSlot() public view returns (Slot) {
    return economics.getCurrentSlot();
  }

  function _getBlobBaseFee() internal view returns (uint256) {
    return VM.getBlobBaseFee();
  }
}
