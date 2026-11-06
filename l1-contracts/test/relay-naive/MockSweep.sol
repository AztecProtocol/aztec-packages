// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

/// @notice Stands in for a sweep: one call that flips a flag from false to true (one cold zero-to-non-zero SSTORE).
contract MockSweep {
  bool public flag;

  function flip() external {
    flag = true;
  }
}
