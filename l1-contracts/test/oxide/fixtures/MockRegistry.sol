// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";

contract MockRegistry {
  IHaveVersion internal canonicalRollup;

  function setCanonicalRollup(IHaveVersion _canonicalRollup) external {
    canonicalRollup = _canonicalRollup;
  }

  function getCanonicalRollup() external view returns (IHaveVersion) {
    return canonicalRollup;
  }
}
