// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {KeyStorage, Keys, Validator} from "@aztec/governance/libraries/KeyStorage.sol";

/// @title KeyStorageHarness
/// @notice Thin wrapper that exposes every *public* helper in `KeyStorage` under
///         **the same function names** so Forge tests can call them via an
///         external message call (depth +1).  This allows `vm.expectRevert` to
///         work, because the revert now happens in a deeper frame than the
///         cheat‑code.
contract KeyStorageHarness {
  using KeyStorage for Keys;

  Keys internal ks; // the real registry struct lives here

  function addKey(uint256[2] calldata pk1, uint256[4] calldata pk2) external {
    ks.addKey(pk1, pk2);
  }

  function deactivateKey() external {
    ks.deactivateKey();
  }

  function reactivateKey() external {
    ks.reactivateKey();
  }

  function getValidator(uint32 id) external view returns (Validator memory) {
    return ks.getValidator(id);
  }

  function getValidatorsCount() external view returns (uint256) {
    return ks.getValidatorsCount();
  }

  function getLiveIds() external view returns (uint32[] memory) {
    return ks.getLiveIds();
  }

  function getLiveIdsCount() external view returns (uint256) {
    return ks.getLiveIdsCount();
  }

  function getPositionInLive(uint32 id) external view returns (uint32) {
    return ks.getPositionInLive(id);
  }

  function getIdOf(address owner) external view returns (uint32) {
    return ks.getIdOf(owner);
  }

  function isValidatorActive(uint32 id) external view returns (bool) {
    return ks.isValidatorActive(id);
  }

  function getActiveValidators() external view returns (Validator[] memory) {
    return ks.getActiveValidators();
  }
}
