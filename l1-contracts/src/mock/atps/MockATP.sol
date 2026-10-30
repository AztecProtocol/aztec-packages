// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IATP} from "@aztec/periphery/interfaces/IATP.sol";

/**
 * @title MockATP
 * @author Aztec Labs
 * @notice Minimal stand-in for an Aztec Token Position (ATP): the vesting contract that knows its registry.
 * @dev Also serves as the implementation of mainnet-shaped positions: those are EIP-1167 clones of it, and the
 *      registry is an immutable of the implementation, so a clone answers `getRegistry()` through a delegatecall.
 */
contract MockATP is IATP {
  address internal immutable REGISTRY;

  /**
   * @param _registry The registry this ATP reports it was created from
   */
  constructor(address _registry) {
    REGISTRY = _registry;
  }

  /**
   * @notice Returns the registry the ATP was created from
   * @return The registry address
   */
  function getRegistry() external view override(IATP) returns (address) {
    return REGISTRY;
  }
}
