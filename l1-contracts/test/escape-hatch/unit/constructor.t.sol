// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase} from "../base.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract EscapeHatchConstructorTest is EscapeHatchBase {
  // Storage for fuzzed values that pass parent constraints
  uint256 internal fuzzLagInHatches;
  uint96 internal fuzzBondSize;
  uint96 internal fuzzWithdrawalTax;
  uint96 internal fuzzFailedHatchPunishment;
  uint256 internal fuzzFrequency;
  uint256 internal fuzzActiveDuration;

  function test_WhenLAG_IN_HATCHESLT1() external {
    // it should revert {EscapeHatch__InvalidConfiguration}
    vm.expectRevert(Errors.EscapeHatch__InvalidConfiguration.selector);
    new EscapeHatch(
      address(rollup),
      address(bondToken),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      DEFAULT_FREQUENCY,
      DEFAULT_ACTIVE_DURATION,
      0,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
  }

  modifier whenLAG_IN_HATCHESGE1(uint256 _lagInHatches) {
    fuzzLagInHatches = bound(_lagInHatches, 1, 10);
    _;
  }

  function test_WhenACTIVE_DURATIONLT2(uint256 _lagInHatches, uint256 _activeDuration)
    external
    whenLAG_IN_HATCHESGE1(_lagInHatches)
  {
    // it should revert {EscapeHatch__InvalidConfiguration}
    _activeDuration = bound(_activeDuration, 0, 1);

    vm.expectRevert(Errors.EscapeHatch__InvalidConfiguration.selector);
    new EscapeHatch(
      address(rollup),
      address(bondToken),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      DEFAULT_FREQUENCY,
      _activeDuration,
      fuzzLagInHatches,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
  }

  modifier whenACTIVE_DURATIONGE2(uint256 _activeDuration) {
    // Leave room for frequency > activeDuration
    fuzzActiveDuration = bound(_activeDuration, 2, type(uint64).max);
    _;
  }

  uint256 internal constant LAG_IN_EPOCHS_FOR_SET_SIZE = 2;

  function test_WhenFREQUENCYLELAG_IN_EPOCHS_FOR_SET_SIZE(
    uint256 _lagInHatches,
    uint256 _activeDuration,
    uint256 _frequency
  ) external whenLAG_IN_HATCHESGE1(_lagInHatches) whenACTIVE_DURATIONGE2(_activeDuration) {
    // it should revert {EscapeHatch__InvalidConfiguration}
    _frequency = bound(_frequency, 0, LAG_IN_EPOCHS_FOR_SET_SIZE);

    vm.expectRevert(Errors.EscapeHatch__InvalidConfiguration.selector);
    new EscapeHatch(
      address(rollup),
      address(bondToken),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      _frequency,
      fuzzActiveDuration,
      fuzzLagInHatches,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
  }

  modifier whenFREQUENCYGTLAG_IN_EPOCHS_FOR_SET_SIZE(uint256 _frequency) {
    // FREQUENCY must be > LAG_IN_EPOCHS_FOR_SET_SIZE (which is 2)
    // But also needs to allow for testing FREQUENCY <= ACTIVE_DURATION
    // So we bound to (2, activeDuration + some buffer]
    fuzzFrequency = bound(_frequency, LAG_IN_EPOCHS_FOR_SET_SIZE + 1, fuzzActiveDuration + 100);
    _;
  }

  function test_WhenFREQUENCYLEACTIVE_DURATION(uint256 _lagInHatches, uint256 _activeDuration, uint256 _frequency)
    external
    whenLAG_IN_HATCHESGE1(_lagInHatches)
    whenACTIVE_DURATIONGE2(_activeDuration)
    whenFREQUENCYGTLAG_IN_EPOCHS_FOR_SET_SIZE(_frequency)
  {
    // it should revert {EscapeHatch__InvalidConfiguration}

    fuzzActiveDuration = bound(_activeDuration, 3, type(uint64).max);

    // Bound frequency to be > LAG_IN_EPOCHS_FOR_SET_SIZE but <= ACTIVE_DURATION
    uint256 frequency = bound(_frequency, LAG_IN_EPOCHS_FOR_SET_SIZE + 1, fuzzActiveDuration);

    vm.expectRevert(Errors.EscapeHatch__InvalidConfiguration.selector);
    new EscapeHatch(
      address(rollup),
      address(bondToken),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      frequency,
      fuzzActiveDuration,
      fuzzLagInHatches,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
  }

  modifier whenFREQUENCYGTACTIVE_DURATION(uint256 _frequency) {
    fuzzFrequency = bound(_frequency, fuzzActiveDuration + 1, type(uint128).max);
    _;
  }

  function test_WhenBOND_SIZEEQ0(uint256 _lagInHatches, uint256 _activeDuration, uint256 _frequency)
    external
    whenLAG_IN_HATCHESGE1(_lagInHatches)
    whenACTIVE_DURATIONGE2(_activeDuration)
    whenFREQUENCYGTLAG_IN_EPOCHS_FOR_SET_SIZE(_frequency)
    whenFREQUENCYGTACTIVE_DURATION(_frequency)
  {
    // it should revert {EscapeHatch__InvalidConfiguration}
    vm.expectRevert(Errors.EscapeHatch__InvalidConfiguration.selector);
    new EscapeHatch(
      address(rollup),
      address(bondToken),
      0,
      0,
      0,
      fuzzFrequency,
      fuzzActiveDuration,
      fuzzLagInHatches,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
  }

  modifier whenBOND_SIZEGT0(uint96 _bondSize) {
    // Leave room for punishment/tax > bondSize tests
    fuzzBondSize = uint96(bound(_bondSize, 1, type(uint96).max - 1));
    _;
  }

  function test_WhenFAILED_HATCH_PUNISHMENTGTBOND_SIZE(
    uint256 _lagInHatches,
    uint256 _activeDuration,
    uint256 _frequency,
    uint96 _bondSize,
    uint96 _punishment
  )
    external
    whenLAG_IN_HATCHESGE1(_lagInHatches)
    whenACTIVE_DURATIONGE2(_activeDuration)
    whenFREQUENCYGTLAG_IN_EPOCHS_FOR_SET_SIZE(_frequency)
    whenFREQUENCYGTACTIVE_DURATION(_frequency)
    whenBOND_SIZEGT0(_bondSize)
  {
    // it should revert {EscapeHatch__InvalidConfiguration}
    _punishment = uint96(bound(_punishment, uint256(fuzzBondSize) + 1, type(uint96).max));

    vm.expectRevert(Errors.EscapeHatch__InvalidConfiguration.selector);
    new EscapeHatch(
      address(rollup),
      address(bondToken),
      fuzzBondSize,
      0,
      _punishment,
      fuzzFrequency,
      fuzzActiveDuration,
      fuzzLagInHatches,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
  }

  modifier whenFAILED_HATCH_PUNISHMENTLEBOND_SIZE(uint96 _punishment) {
    fuzzFailedHatchPunishment = uint96(bound(_punishment, 0, fuzzBondSize));
    _;
  }

  function test_WhenWITHDRAWAL_TAXGTBOND_SIZE(
    uint256 _lagInHatches,
    uint256 _activeDuration,
    uint256 _frequency,
    uint96 _bondSize,
    uint96 _punishment,
    uint96 _tax
  )
    external
    whenLAG_IN_HATCHESGE1(_lagInHatches)
    whenACTIVE_DURATIONGE2(_activeDuration)
    whenFREQUENCYGTLAG_IN_EPOCHS_FOR_SET_SIZE(_frequency)
    whenFREQUENCYGTACTIVE_DURATION(_frequency)
    whenBOND_SIZEGT0(_bondSize)
    whenFAILED_HATCH_PUNISHMENTLEBOND_SIZE(_punishment)
  {
    // it should revert {EscapeHatch__InvalidConfiguration}
    _tax = uint96(bound(_tax, uint256(fuzzBondSize) + 1, type(uint96).max));

    vm.expectRevert(Errors.EscapeHatch__InvalidConfiguration.selector);
    new EscapeHatch(
      address(rollup),
      address(bondToken),
      fuzzBondSize,
      _tax,
      fuzzFailedHatchPunishment,
      fuzzFrequency,
      fuzzActiveDuration,
      fuzzLagInHatches,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
  }

  modifier whenWITHDRAWAL_TAXLEBOND_SIZE(uint96 _tax) {
    fuzzWithdrawalTax = uint96(bound(_tax, 0, fuzzBondSize));
    _;
  }

  function test_WhenPROPOSING_EXIT_DELAYGT30Days(
    uint256 _lagInHatches,
    uint256 _activeDuration,
    uint256 _frequency,
    uint96 _bondSize,
    uint96 _punishment,
    uint96 _tax,
    uint256 _proposingExitDelay
  )
    external
    whenLAG_IN_HATCHESGE1(_lagInHatches)
    whenACTIVE_DURATIONGE2(_activeDuration)
    whenFREQUENCYGTLAG_IN_EPOCHS_FOR_SET_SIZE(_frequency)
    whenFREQUENCYGTACTIVE_DURATION(_frequency)
    whenBOND_SIZEGT0(_bondSize)
    whenFAILED_HATCH_PUNISHMENTLEBOND_SIZE(_punishment)
    whenWITHDRAWAL_TAXLEBOND_SIZE(_tax)
  {
    // it should revert {EscapeHatch__InvalidConfiguration}
    _proposingExitDelay = bound(_proposingExitDelay, 30 days + 1, type(uint128).max);

    vm.expectRevert(Errors.EscapeHatch__InvalidConfiguration.selector);
    new EscapeHatch(
      address(rollup),
      address(bondToken),
      fuzzBondSize,
      fuzzWithdrawalTax,
      fuzzFailedHatchPunishment,
      fuzzFrequency,
      fuzzActiveDuration,
      fuzzLagInHatches,
      _proposingExitDelay
    );
  }

  function test_WhenPROPOSING_EXIT_DELAYLE30Days(
    uint256 _lagInHatches,
    uint256 _activeDuration,
    uint256 _frequency,
    uint96 _bondSize,
    uint96 _punishment,
    uint96 _tax,
    uint256 _proposingExitDelay
  )
    external
    whenLAG_IN_HATCHESGE1(_lagInHatches)
    whenACTIVE_DURATIONGE2(_activeDuration)
    whenFREQUENCYGTLAG_IN_EPOCHS_FOR_SET_SIZE(_frequency)
    whenFREQUENCYGTACTIVE_DURATION(_frequency)
    whenBOND_SIZEGT0(_bondSize)
    whenFAILED_HATCH_PUNISHMENTLEBOND_SIZE(_punishment)
    whenWITHDRAWAL_TAXLEBOND_SIZE(_tax)
  {
    // it should set ROLLUP immutable
    // it should set BOND_TOKEN immutable
    // it should set BOND_SIZE immutable
    // it should set WITHDRAWAL_TAX immutable
    // it should set FAILED_HATCH_PUNISHMENT immutable
    // it should set FREQUENCY immutable
    // it should set ACTIVE_DURATION immutable
    // it should set LAG_IN_HATCHES immutable
    // it should set PROPOSING_EXIT_DELAY immutable
    uint256 fuzzProposingExitDelay = bound(_proposingExitDelay, 0, 30 days);

    EscapeHatch newEscapeHatch = new EscapeHatch(
      address(rollup),
      address(bondToken),
      fuzzBondSize,
      fuzzWithdrawalTax,
      fuzzFailedHatchPunishment,
      fuzzFrequency,
      fuzzActiveDuration,
      fuzzLagInHatches,
      fuzzProposingExitDelay
    );

    assertEq(newEscapeHatch.getRollup(), address(rollup), "ROLLUP mismatch");
    assertEq(newEscapeHatch.getBondToken(), address(bondToken), "BOND_TOKEN mismatch");
    assertEq(newEscapeHatch.getBondSize(), fuzzBondSize, "BOND_SIZE mismatch");
    assertEq(newEscapeHatch.getWithdrawalTax(), fuzzWithdrawalTax, "WITHDRAWAL_TAX mismatch");
    assertEq(newEscapeHatch.getFailedHatchPunishment(), fuzzFailedHatchPunishment, "FAILED_HATCH_PUNISHMENT mismatch");
    assertEq(newEscapeHatch.getFrequency(), fuzzFrequency, "FREQUENCY mismatch");
    assertEq(newEscapeHatch.getActiveDuration(), fuzzActiveDuration, "ACTIVE_DURATION mismatch");
    assertEq(newEscapeHatch.getLagInHatches(), fuzzLagInHatches, "LAG_IN_HATCHES mismatch");
    assertEq(newEscapeHatch.getProposingExitDelay(), fuzzProposingExitDelay, "PROPOSING_EXIT_DELAY mismatch");
  }
}
