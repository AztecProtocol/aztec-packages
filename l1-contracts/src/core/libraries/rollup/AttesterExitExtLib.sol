// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {StakingLib, AttesterExitLimitState} from "./StakingLib.sol";

/// @notice External attester-exit functions separated to keep rollup libraries within the contract size limit.
/// @dev Library calls execute against the calling rollup's staking storage.
library AttesterExitExtLib {
  /// @notice Initiates an exit for a position controlled by the calling attester.
  function initiateWithdrawByAttester(address _attester) external {
    StakingLib.initiateWithdrawByAttester(_attester);
  }

  /// @notice Returns the current window used to count attester exits.
  function getAttesterExitWindow() external view returns (Timestamp) {
    return StakingLib.getAttesterExitWindow();
  }

  /// @notice Returns attester-exit capacity for the calling rollup.
  /// @dev canExit does not establish eligibility of an individual position.
  function getAttesterExitLimitState() external view returns (AttesterExitLimitState memory) {
    return StakingLib.getAttesterExitLimitState();
  }
}
