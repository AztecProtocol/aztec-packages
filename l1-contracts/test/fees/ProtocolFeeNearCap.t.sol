// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {FeeLib, ManaMinFeeComponents} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Test} from "forge-std/Test.sol";

/**
 * @title ProtocolFeeNearCapTest
 * @notice The fee header's per-mana protocol fee moved from the separately-converted congestion
 *         component to the single subtraction `summedMinFee - sequencerCost - proverCost`. The
 *         two are identical whenever the uint128 cap in summedMinFee does not bind, which is the
 *         only place mu = 0 behavior genuinely changes. These fuzzes pin that equivalence and the
 *         cap-binding/clamp behavior.
 */
contract ProtocolFeeNearCapTest is Test {
  uint256 internal constant CAP = type(uint128).max;

  function _components(uint256 _sequencerCost, uint256 _proverCost, uint256 _protocolFee)
    internal
    pure
    returns (ManaMinFeeComponents memory)
  {
    return ManaMinFeeComponents({
      sequencerCost: _sequencerCost, proverCost: _proverCost, protocolFee: _protocolFee, congestionMultiplier: 0
    });
  }

  /// @notice When the cap does not bind, the header value equals the old behavior (the
  ///         separately-converted congestion component) exactly.
  function test_headerValueUnchangedWhenCapDoesNotBind(
    uint128 _sequencerCost,
    uint128 _proverCost,
    uint128 _protocolFee
  ) public pure {
    // Bound the sum inside the cap; the components stay near it.
    uint256 s = uint256(_sequencerCost);
    uint256 p = uint256(_proverCost);
    uint256 c = uint256(_protocolFee);
    vm.assume(s + p + c <= CAP);

    ManaMinFeeComponents memory components = _components(s, p, c);
    assertEq(FeeLib.summedMinFee(components), s + p + c, "cap must not bind");
    assertEq(FeeLib.protocolFeePerMana(components), c, "header value must equal the old congestion component");
  }

  /// @notice When the cap binds but still covers operator cost, the header value is exactly
  ///         `cap - sequencerCost - proverCost`: the shortfall reduces only the protocol tranche
  ///         and operators stay whole.
  function test_operatorsWholeWhenCapBinds(uint128 _sequencerCost, uint128 _proverCost, uint256 _protocolFee)
    public
    pure
  {
    uint256 s = uint256(_sequencerCost);
    uint256 p = uint256(_proverCost);
    vm.assume(s + p <= CAP);
    // Force the cap to bind: the raw sum must exceed the cap.
    uint256 c = bound(_protocolFee, CAP + 1 - s - p, type(uint256).max - s - p);

    ManaMinFeeComponents memory components = _components(s, p, c);
    uint256 headerValue = FeeLib.protocolFeePerMana(components);

    assertEq(FeeLib.summedMinFee(components), CAP, "cap must bind");
    assertEq(headerValue, CAP - s - p, "shortfall must reduce only the protocol tranche");
    assertEq(FeeLib.summedMinFee(components) - headerValue, s + p, "operators must stay whole");
    assertLt(headerValue, c, "protocol tranche must absorb the shortfall");
  }

  /// @notice When the capped fee cannot even cover operator cost, the header value clamps to 0
  ///         instead of underflowing.
  function test_negativeClampWhenOperatorCostExceedsCap(
    uint256 _sequencerCost,
    uint256 _proverCost,
    uint256 _protocolFee
  ) public pure {
    uint256 s = bound(_sequencerCost, 1, CAP);
    uint256 p = bound(_proverCost, CAP + 1 - s, CAP);
    uint256 c = bound(_protocolFee, 0, CAP);
    // Operator cost alone exceeds the cap, so the subtraction would go negative.
    assertGt(s + p, CAP, "setup: operator cost must exceed the cap");

    ManaMinFeeComponents memory components = _components(s, p, c);
    assertEq(FeeLib.summedMinFee(components), CAP, "cap must bind");
    assertEq(FeeLib.protocolFeePerMana(components), 0, "header value must clamp to zero");
  }

  /// @notice Boundary: operator cost equal to the capped fee leaves exactly zero for the protocol.
  function test_zeroAtExactBoundary() public pure {
    ManaMinFeeComponents memory components = _components(CAP - 1, 1, 5);
    assertEq(FeeLib.summedMinFee(components), CAP, "cap must bind");
    assertEq(FeeLib.protocolFeePerMana(components), 0, "capped fee == operator cost must give zero");
  }
}
