// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Timestamp, TimeLib, Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {BlobLib} from "@aztec-blob-lib/BlobLib.sol";
import {AttestationLib} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {
  ProposeLib,
  ProposeArgs,
  ProposeConfig,
  CommitteeAttestations,
  ValidateHeaderArgs,
  ValidatorSelectionLib
} from "./ProposeLib.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";

/**
 * @title RollupOperationsExtLib - External Rollup Library (Proposal Functions)
 * @author Aztec Labs
 * @notice External library containing proposal-related functions for the Rollup contract to avoid exceeding max
 * contract size.
 *
 * @dev This library serves as an external library for the Rollup contract, splitting off proposal-related
 *      functionality to keep the main contract within the maximum contract size limit. Epoch-proof functions
 *      live in EpochProofExtLib to keep this library itself deployable. The library contains external
 *      functions primarily focused on:
 *      - Checkpoint proposal submission and validation
 *      - Blob validation and commitment management
 *      - Chain pruning operations
 */
library RollupOperationsExtLib {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using AttestationLib for CommitteeAttestations;

  function validateHeaderWithAttestations(
    ValidateHeaderArgs calldata _args,
    CommitteeAttestations calldata _attestations,
    address[] calldata _signers,
    Signature calldata _attestationsAndSignersSignature
  ) external {
    ProposeLib.validateHeader(_args);
    if (_attestations.isEmpty()) {
      return; // No attestations to validate
    }

    Slot slot = _args.header.slotNumber;
    Epoch epoch = slot.epochFromSlot();
    ValidatorSelectionLib.verifyAttestations(epoch, _attestations, _args.digest);
    ValidatorSelectionLib.verifyProposer(
      slot, epoch, _attestations, _signers, _args.digest, _attestationsAndSignersSignature, false
    );
  }

  function propose(
    ProposeArgs calldata _args,
    CommitteeAttestations memory _attestations,
    address[] calldata _signers,
    Signature calldata _attestationsAndSignersSignature,
    bytes calldata _blobInput,
    bool _checkBlob,
    IInbox _inbox
  ) external {
    ProposeLib.propose(
      _args,
      _attestations,
      _signers,
      _attestationsAndSignersSignature,
      _blobInput,
      ProposeConfig({inbox: _inbox, checkBlob: _checkBlob})
    );
  }

  function prune() external {
    require(STFLib.canPruneAtTime(Timestamp.wrap(block.timestamp)), Errors.Rollup__NothingToPrune());
    STFLib.prune();
  }

  function validateBlobs(bytes calldata _blobsInput, bool _checkBlob)
    external
    view
    returns (bytes32[] memory blobHashes, bytes32 blobsHashesCommitment, bytes[] memory blobCommitments)
  {
    return BlobLib.validateBlobs(_blobsInput, _checkBlob);
  }

  function getBlobBaseFee() external view returns (uint256) {
    return BlobLib.getBlobBaseFee();
  }
}
