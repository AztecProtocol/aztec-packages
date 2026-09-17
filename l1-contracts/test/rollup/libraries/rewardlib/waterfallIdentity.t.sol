// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RewardLibBase} from "./RewardLibBase.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {FeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {FeeLib, ManaMinFeeComponents} from "@aztec/core/libraries/rollup/FeeLib.sol";

/**
 * @title WaterfallIdentityTest
 * @notice The AZIP waterfall identity: for randomized per-mana components (covering every
 *         (mu, gas, price) combination the fee model can produce), mana used, and injected
 *         priority tips,
 *
 *           fee - protocolFee == (sequencerCost + proverCost) * manaUsed + tips   EXACTLY
 *           prover tranche    == proverCost * manaUsed                            EXACTLY
 *           sequencer tranche == sequencerCost * manaUsed + tips                  EXACTLY
 *           protocol tranche  == headerProtocolFee * manaUsed, paid to the live recipient
 *
 *         The header's per-mana protocol fee is produced by the real one-subtraction helper
 *         (FeeLib.protocolFeePerMana) and the split by the real waterfall
 *         (RewardLib.handleRewardsAndFees), so a wei of drift anywhere fails the exact asserts.
 */
contract WaterfallIdentityTest is RewardLibBase {
  struct Vals {
    uint256 s;
    uint256 p;
    uint256 c;
    uint256 manaUsed;
    uint256 tips;
    uint256 headerProtocolFee;
    uint256 fee;
    uint256 protocolTranche;
    uint256 proverTranche;
    uint256 sequencerTranche;
  }

  /// @dev Bounds keep every header field inside its compressed width (proverCost uint63,
  ///      protocolFee uint64, manaUsed uint32) so compression cannot saturate and mask a drift.
  function test_waterfallIdentity(
    uint64 _sequencerCost,
    uint64 _proverCost,
    uint64 _protocolFee,
    uint32 _manaUsed,
    uint96 _tips,
    uint32 _sequencerBps
  ) external prepare(0, _sequencerBps) {
    Vals memory v;
    v.s = bound(_sequencerCost, 0, 2 ** 62);
    v.p = bound(_proverCost, 0, 2 ** 62);
    v.c = bound(_protocolFee, 0, 2 ** 63);
    v.manaUsed = _manaUsed;
    v.tips = _tips;

    // The real one-subtraction helper produces the header value from the components.
    ManaMinFeeComponents memory components =
      ManaMinFeeComponents({sequencerCost: v.s, proverCost: v.p, protocolFee: v.c, congestionMultiplier: 0});
    v.headerProtocolFee = FeeLib.protocolFeePerMana(components);
    v.fee = FeeLib.summedMinFee(components) * v.manaUsed + v.tips;

    // Checkpoint 0 keeps the zeroed genesis header; checkpoint 1 carries the fuzzed values.
    wrapper.addFeeHeader(
      FeeHeader({
        excessMana: 0, manaUsed: v.manaUsed, ethPerFeeAsset: 0, protocolFee: v.headerProtocolFee, proverCost: v.p
      })
    );
    _setHeaders(2, sequencer);
    args.headers[1].accumulatedFees = v.fee;
    args.end = args.start + 1;

    address recipient = makeAddr("protocolFeeRecipient");
    wrapper.updateProtocolFeeRecipient(recipient);

    deal(address(feeAsset), address(feePortal), v.fee);

    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));

    v.protocolTranche = feeAsset.balanceOf(recipient);
    v.proverTranche = wrapper.getCollectiveProverRewardsForEpoch(Epoch.wrap(0));
    v.sequencerTranche = wrapper.getSequencerRewards(sequencer);

    assertEq(v.protocolTranche, v.headerProtocolFee * v.manaUsed, "protocol tranche mismatch");
    assertEq(
      v.fee - v.protocolTranche,
      (v.s + v.p) * v.manaUsed + v.tips,
      "fee - protocolFee must equal cost * manaUsed + tips"
    );
    assertEq(v.proverTranche, v.p * v.manaUsed, "prover tranche must be exactly proverCost * manaUsed");
    assertEq(v.sequencerTranche, v.s * v.manaUsed + v.tips, "sequencer tranche must be cost remainder + tips");
    assertEq(v.protocolTranche + v.proverTranche + v.sequencerTranche, v.fee, "waterfall must be exhaustive");
  }

  /// @notice After a recipient change, the very next waterfall run pays the NEW recipient and the
  ///         old burn-address default receives nothing.
  function test_waterfallPaysUpdatedRecipient() external prepare(0, 5000) {
    uint256 manaUsed = 1e6;
    uint256 protocolFeePerMana = 1e9;
    uint256 fee = 5e9 * manaUsed;

    wrapper.addFeeHeader(
      FeeHeader({excessMana: 0, manaUsed: manaUsed, ethPerFeeAsset: 0, protocolFee: protocolFeePerMana, proverCost: 0})
    );
    _setHeaders(2, sequencer);
    args.headers[1].accumulatedFees = fee;
    args.end = args.start + 1;

    address oldRecipient = wrapper.getProtocolFeeRecipient();
    assertEq(oldRecipient, address(bytes20("CUAUHXICALLI")), "default must be the burn address");

    address newRecipient = makeAddr("newRecipient");
    assertEq(wrapper.updateProtocolFeeRecipient(newRecipient), oldRecipient, "must return the old recipient");

    deal(address(feeAsset), address(feePortal), fee);
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));

    assertEq(feeAsset.balanceOf(newRecipient), protocolFeePerMana * manaUsed, "new recipient must be paid");
    assertEq(feeAsset.balanceOf(oldRecipient), 0, "old recipient must receive nothing");
  }
}
