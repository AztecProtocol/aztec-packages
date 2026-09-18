// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Signature, SignatureLib} from "@aztec/shared/libraries/SignatureLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {CoordinationSignatureLib} from "./CoordinationSignatureLib.sol";
import {StakingLib, AttesterExitLimitState, AttesterExitAuthorization} from "./StakingLib.sol";

/// @notice External attester-exit functions separated to keep rollup libraries within the contract size limit.
/// @dev Library calls execute against the calling rollup's staking storage.
library AttesterExitExtLib {
  using SignatureLib for Signature;

  bytes32 internal constant ATTESTER_EXIT_TYPEHASH = keccak256("AttesterExit(address attester,uint256 deadline)");

  /// @notice Initiates an exit for a position controlled by the calling attester.
  function initiateWithdrawByAttester(address _attester) external {
    StakingLib.initiateWithdrawByAttester(_attester);
  }

  /// @notice Initiates an attester exit authorized by an EIP-712 signature.
  /// @param _authorization The signed exit authorization.
  function initiateWithdrawByAttesterWithSignature(AttesterExitAuthorization calldata _authorization) external {
    _authorize(_authorization);
    StakingLib.initiateWithdrawByAttesterWithSignature(_authorization.attester);
  }

  /// @notice Initiates multiple attester exits authorized by EIP-712 signatures.
  /// @param _authorizations The signed exit authorizations to execute atomically.
  function initiateWithdrawByAttesterBatch(AttesterExitAuthorization[] calldata _authorizations) external {
    uint256 exitCount = _authorizations.length;
    require(exitCount > 0, Errors.Staking__EmptyAttesterExitBatch());

    StakingLib.checkAttesterExitInstance();
    StakingLib.consumeAttesterExitAllowance(exitCount);

    for (uint256 i = 0; i < exitCount;) {
      AttesterExitAuthorization calldata authorization = _authorizations[i];
      _authorize(authorization);
      StakingLib.initiateWithdrawByAttesterBatchItem(authorization.attester);
      unchecked {
        ++i;
      }
    }
  }

  /// @notice Initiates as many authorized attester exits as the current limit permits.
  /// @param _authorizations The ordered signed exit authorizations.
  /// @return exitCount The number of authorizations processed from the start of the array.
  function initiateWithdrawByAttesterBatchUpToLimit(AttesterExitAuthorization[] calldata _authorizations)
    external
    returns (uint256 exitCount)
  {
    uint256 requestedExitCount = _authorizations.length;
    require(requestedExitCount > 0, Errors.Staking__EmptyAttesterExitBatch());

    StakingLib.checkAttesterExitInstance();
    exitCount = StakingLib.consumeAttesterExitAllowanceUpTo(requestedExitCount);

    for (uint256 i = 0; i < exitCount;) {
      AttesterExitAuthorization calldata authorization = _authorizations[i];
      _authorize(authorization);
      StakingLib.initiateWithdrawByAttesterBatchItem(authorization.attester);
      unchecked {
        ++i;
      }
    }
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

  function _authorize(AttesterExitAuthorization calldata _authorization) private view {
    require(
      block.timestamp <= _authorization.deadline,
      Errors.Staking__AttesterExitAuthorizationExpired(_authorization.deadline, block.timestamp)
    );

    bytes32 structHash = keccak256(abi.encode(ATTESTER_EXIT_TYPEHASH, _authorization.attester, _authorization.deadline));
    bytes32 digest = CoordinationSignatureLib.toTypedDataHash(structHash);
    _authorization.signature.verify(_authorization.attester, digest);
  }
}
