// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {CoinIssuerBase} from "./Base.t.sol";

contract MintAvailableTest is CoinIssuerBase {
  function test_GivenRateIs0(uint256 _time) external {
    // it returns 0
    _deploy(0);
    uint256 timeJump = bound(_time, 0, type(uint128).max);
    vm.warp(block.timestamp + timeJump);

    assertEq(nom.mintAvailable(), 0);
  }

  modifier givenRateIsNot0(uint256 _rate) {
    uint256 rate = bound(_rate, 1, type(uint128).max);
    _deploy(rate);

    assertEq(rate, nom.RATE());
    _;
  }

  function test_GivenSameTimeAsDeployment(uint256 _rate) external givenRateIsNot0(_rate) {
    // it returns 0
    assertEq(nom.mintAvailable(), 0);
  }

  function test_GivenAfterDeployment(uint256 _rate, uint256 _time) external givenRateIsNot0(_rate) {
    // it returns >0

    uint256 timeJump = bound(_time, 1, type(uint128).max);
    vm.warp(block.timestamp + timeJump);

    assertGt(nom.mintAvailable(), 0);
    assertEq(nom.mintAvailable(), nom.RATE() * timeJump);
  }
}
