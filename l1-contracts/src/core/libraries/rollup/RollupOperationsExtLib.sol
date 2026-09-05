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
import {CheckpointHeaderValidationFlags, CheckpointPreflightArgs} from "@aztec/core/interfaces/IRollup.sol";
import {FeeLib} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposedHeader} from "./ProposedHeaderLib.sol";
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

  /**
   * @dev Assembles `ValidateHeaderArgs` here rather than in the Rollup: building that struct
   *      (which embeds a full `ProposedHeader`) in the Rollup's own code costs several hundred
   *      bytes of runtime bytecode it cannot spare.
   */
  function validateHeaderWithAttestations(
    ProposedHeader calldata _header,
    CommitteeAttestations calldata _attestations,
    address[] calldata _signers,
    Signature calldata _attestationsAndSignersSignature,
    bytes32 _digest,
    bytes32 _blobsHash,
    CheckpointHeaderValidationFlags calldata _flags
  ) external {
    checkHeaderWithAttestations(
      _header, _attestations, _signers, _attestationsAndSignersSignature, _digest, _blobsHash, _flags
    );
  }

  /**
   * @notice Validates a checkpoint header together with its final Inbox consumption against the parent `propose`
   *         would build on at the simulated `block.timestamp`, returning the bucket sequence to submit as `bucketHint`
   *
   * @dev The parent is derived exactly as `propose` derives it: the effective pending checkpoint at
   *      `block.timestamp`, i.e. the proven tip if the pending chain is prunable at that time. The caller states
   *      which parent it built on and the call rejects any other, so a simulation whose state overrides do not
   *      survive the real prune rule fails here instead of at `propose`. The header's `lastArchiveRoot` is checked
   *      against that parent's archive by the shared header validation, and the parent's consumed total comes from
   *      its stored record, never from the caller. The Inbox check resolves `_expectedTotal` to a live bucket and runs
   *      the same settlement, monotonicity, cap and censorship predicate as `propose`.
   *
   *      Meant to be simulated with the intended execution timestamp and state; the real transaction's
   *      `block.timestamp` remains authoritative.
   *
   * @param _args - The header validation inputs plus the consumed Inbox total and the expected parent
   * @param _inbox - The Inbox to validate consumption against
   * @return The sequence number of the bucket ending at `_args.expectedTotal`
   */
  function validateCheckpointHeaderAndInbox(CheckpointPreflightArgs calldata _args, IInbox _inbox)
    external
    returns (uint64)
  {
    uint256 effectiveParent = STFLib.getEffectivePendingCheckpointNumber(Timestamp.wrap(block.timestamp));
    require(
      effectiveParent == _args.expectedParentCheckpointNumber,
      Errors.Rollup__UnexpectedParentCheckpoint(_args.expectedParentCheckpointNumber, effectiveParent)
    );

    checkHeaderWithAttestations(
      _args.header,
      _args.attestations,
      _args.signers,
      _args.attestationsAndSignersSignature,
      _args.digest,
      _args.blobsHash,
      _args.flags
    );

    return ProposeLib.validateInboxConsumptionAtTotal(
      _inbox,
      _args.header.inboxRollingHash,
      _args.expectedTotal,
      _args.header.slotNumber,
      STFLib.getInboxMsgTotal(effectiveParent)
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

  function checkHeaderWithAttestations(
    ProposedHeader calldata _header,
    CommitteeAttestations calldata _attestations,
    address[] calldata _signers,
    Signature calldata _attestationsAndSignersSignature,
    bytes32 _digest,
    bytes32 _blobsHash,
    CheckpointHeaderValidationFlags calldata _flags
  ) internal {
    ProposeLib.validateHeader(
      ValidateHeaderArgs({
        header: _header,
        digest: _digest,
        manaMinFee: FeeLib.summedMinFee(ProposeLib.getManaMinFeeComponentsAt(Timestamp.wrap(block.timestamp), true)),
        blobsHashesCommitment: _blobsHash,
        flags: _flags
      })
    );

    if (_attestations.isEmpty()) {
      return; // No attestations to validate
    }

    Slot slot = _header.slotNumber;
    Epoch epoch = slot.epochFromSlot();
    ValidatorSelectionLib.verifyAttestations(epoch, _attestations, _digest);
    ValidatorSelectionLib.verifyProposer(
      slot, epoch, _attestations, _signers, _digest, _attestationsAndSignersSignature, false
    );
  }
}
