// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SubmitEpochRootProofArgs, PublicInputArgs, RollupConfig} from "@aztec/core/interfaces/IRollup.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {EpochProofLib} from "./EpochProofLib.sol";

/**
 * @title EpochProofExtLib - External Rollup Library (Epoch Proof Functions)
 * @author Aztec Labs
 * @notice External library containing epoch-proof functions for the Rollup contract to avoid exceeding max
 * contract size.
 *
 * @dev This library serves as an external library for the Rollup contract, splitting off the epoch proof
 *      submission and public-input computation from RollupOperationsExtLib, which the streaming inbox
 *      validation pushed over the deployable size limit. The library contains external functions primarily
 *      focused on:
 *      - Epoch proof submission and verification
 *      - Epoch proof public input computation
 */
library EpochProofExtLib {
  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args, RollupConfig memory _config) external {
    EpochProofLib.submitEpochRootProof(_args, _config);
  }

  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    PublicInputArgs calldata _args,
    ProposedHeader[] calldata _headers,
    bytes calldata _blobPublicInputs,
    RollupConfig memory _config
  ) external view returns (bytes32[] memory) {
    return EpochProofLib.getEpochProofPublicInputs(_start, _end, _args, _headers, _blobPublicInputs, _config);
  }
}
