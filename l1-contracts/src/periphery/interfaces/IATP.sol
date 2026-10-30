// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @notice The subset of an Aztec Token Position (ATP) staker contract that sequencer reward calculators rely on.
 * @dev ATP stakers register themselves as the GSE withdrawer when they deposit, so the withdrawer of an ATP-backed
 *      validator is the staker, not the ATP. The staker exposes the ATP it belongs to.
 */
interface IATPStaker {
  /**
   * @notice Returns the ATP this staker stakes for
   * @return The ATP address
   */
  function getATP() external view returns (address);
}

/**
 * @notice The subset of an Aztec Token Position (ATP) contract that sequencer reward calculators rely on.
 */
interface IATP {
  /**
   * @notice Returns the registry the ATP was created from
   * @return The registry address
   */
  function getRegistry() external view returns (address);
}
