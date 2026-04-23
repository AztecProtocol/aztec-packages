// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Caps} from "@aztec/oxide/Caps.sol";

contract CapsHarness is Caps {
  constructor(uint256 _rate, uint256 _globalLimit, uint256 _txLimit) Caps(_rate, _globalLimit, _txLimit) {}

  function markUsage(uint256 _amount) external {
    _markUsage(_amount);
  }
}

contract CapsTest is Test {
  CapsHarness internal caps;

  uint256 internal constant RATE = 1 ether;
  uint256 internal constant GLOBAL_LIMIT = 1000 ether;
  uint256 internal constant TX_LIMIT = 100 ether;

  function setUp() public {
    caps = new CapsHarness(RATE, GLOBAL_LIMIT, TX_LIMIT);
  }

  function test_startsAtGlobalLimit() public view {
    assertEq(caps.getCurrentAvailable(), GLOBAL_LIMIT);
  }

  function test_markUsage_decreasesAvailable() public {
    caps.markUsage(50 ether);
    assertEq(caps.getCurrentAvailable(), GLOBAL_LIMIT - 50 ether);
  }

  function test_markUsage_revertsWhenOverTxLimit() public {
    vm.expectRevert(Caps.TxLimitSurpassed.selector);
    caps.markUsage(TX_LIMIT + 1);
  }

  function test_markUsage_revertsWhenOverGlobalLimit() public {
    uint256 drained;
    while (drained + TX_LIMIT <= GLOBAL_LIMIT) {
      caps.markUsage(TX_LIMIT);
      drained += TX_LIMIT;
    }
    vm.expectRevert(Caps.GlobalLimitSurpassed.selector);
    caps.markUsage(1);
  }

  function test_rateAccrual_capsAtGlobalLimit() public {
    caps.markUsage(TX_LIMIT);
    uint256 afterUse = caps.getCurrentAvailable();
    assertEq(afterUse, GLOBAL_LIMIT - TX_LIMIT);

    vm.warp(block.timestamp + 10);
    assertEq(caps.getCurrentAvailable(), GLOBAL_LIMIT - TX_LIMIT + 10 * RATE);

    vm.warp(block.timestamp + 1_000_000);
    assertEq(caps.getCurrentAvailable(), GLOBAL_LIMIT);
  }
}
