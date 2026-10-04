// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface

import {AttesterConfig} from "@aztec/governance/GSE.sol";

/**
 * @notice Stand-in for the GSE's withdrawer lookup, for calculator tests that need arbitrary withdrawers.
 * @dev Keeps the GSE's storage shape for the attester config (public key and withdrawer, three slots) and reads the
 *      whole struct like `GSE.getWithdrawer` does, so a lookup costs the same as against the real GSE.
 */
contract FakeGSE {
  mapping(address attester => AttesterConfig config) internal configOf;

  function setWithdrawer(address _attester, address _withdrawer) external {
    configOf[_attester].withdrawer = _withdrawer;
  }

  function getWithdrawer(address _attester) external view returns (address) {
    AttesterConfig memory config = configOf[_attester];
    return config.withdrawer;
  }
}
