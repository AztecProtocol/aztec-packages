// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IATPStaker} from "@aztec/periphery/interfaces/IATP.sol";

/**
 * @title MockATPStaker
 * @author Aztec Labs
 * @notice Minimal stand-in for an ATP staker: the contract an ATP stakes through, which registers itself as the
 *         GSE withdrawer and exposes the ATP it belongs to.
 */
contract MockATPStaker is IATPStaker {
  address internal immutable ATP;

  /**
   * @param _atp The ATP this staker stakes for
   */
  constructor(address _atp) {
    ATP = _atp;
  }

  /**
   * @notice Returns the ATP this staker stakes for
   * @return The ATP address
   */
  function getATP() external view override(IATPStaker) returns (address) {
    return ATP;
  }
}
