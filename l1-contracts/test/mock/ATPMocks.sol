// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IATP, IATPStaker} from "@aztec/core/libraries/rollup/RewardLib.sol";

/**
 * @notice Minimal stand-in for an Aztec Token Position (ATP): the vesting contract that knows its registry.
 */
contract MockATP is IATP {
  address internal immutable REGISTRY;

  constructor(address _registry) {
    REGISTRY = _registry;
  }

  function getRegistry() external view override(IATP) returns (address) {
    return REGISTRY;
  }
}

/**
 * @notice Minimal stand-in for an ATP staker: the contract an ATP stakes through, which registers itself as the
 *         GSE withdrawer and only exposes the ATP it belongs to.
 */
contract MockATPStaker is IATPStaker {
  address internal immutable ATP;

  constructor(address _atp) {
    ATP = _atp;
  }

  function getATP() external view override(IATPStaker) returns (address) {
    return ATP;
  }
}

/**
 * @notice Deploys a mock ATP for `_registry` and a mock staker pointing at it.
 */
function deployMockATPStaker(address _registry) returns (MockATPStaker staker, MockATP atp) {
  atp = new MockATP(_registry);
  staker = new MockATPStaker(address(atp));
}
