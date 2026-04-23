// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Math} from "@oz/utils/math/Math.sol";

abstract contract Caps {
  uint256 public immutable RATE;
  uint256 public immutable GLOBAL_LIMIT;
  uint256 public immutable TX_LIMIT;

  uint256 public $lastUpdatedTime;
  uint256 public $cachedAvailable;

  error TxLimitSurpassed();
  error GlobalLimitSurpassed();

  constructor(uint256 _rate, uint256 _globalLimit, uint256 _txLimit) {
    RATE = _rate;
    GLOBAL_LIMIT = _globalLimit;
    TX_LIMIT = _txLimit;

    $lastUpdatedTime = block.timestamp;
    $cachedAvailable = _globalLimit;
  }

  function getCurrentAvailable() public view returns (uint256) {
    uint256 increase = (block.timestamp - $lastUpdatedTime) * RATE;
    return Math.min($cachedAvailable + increase, GLOBAL_LIMIT);
  }

  function _markUsage(uint256 _amount) internal {
    require(_amount <= TX_LIMIT, TxLimitSurpassed());
    uint256 available = getCurrentAvailable();
    require(_amount <= available, GlobalLimitSurpassed());

    $lastUpdatedTime = block.timestamp;
    $cachedAvailable = available - _amount;
  }
}
