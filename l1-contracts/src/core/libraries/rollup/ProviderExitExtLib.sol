// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {StakingLib, ProviderExitLimitState} from "./StakingLib.sol";

/// @notice External provider-exit functions separated to keep rollup libraries within the contract size limit.
/// @dev Library calls execute against the calling rollup's staking storage.
library ProviderExitExtLib {
  /// @notice Initiates an exit for a position controlled by the calling attester.
  function initiateProviderExit(address _attester) external {
    StakingLib.initiateProviderExit(_attester);
  }

  /// @notice Returns the current window used to count provider exits.
  function getProviderExitWindow() external view returns (Timestamp) {
    return StakingLib.getProviderExitWindow();
  }

  /// @notice Returns provider-exit capacity for the calling rollup.
  /// @dev canExit does not establish eligibility of an individual position.
  function getProviderExitLimitState() external view returns (ProviderExitLimitState memory) {
    return StakingLib.getProviderExitLimitState();
  }
}
