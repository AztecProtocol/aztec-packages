// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {IInbox} from "../interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "../interfaces/messagebridge/IOutbox.sol";

import {SignatureLib} from "../sequencer_selection/SignatureLib.sol";
import {DataStructures} from "../libraries/DataStructures.sol";

interface ITestRollup {
  function setVerifier(address _verifier) external;
  function setVkTreeRoot(bytes32 _vkTreeRoot) external;
  function setAssumeProvenThroughBlockNumber(uint256 blockNumber) external;
}

interface IRollup {
  event L2BlockProposed(uint256 indexed blockNumber, bytes32 indexed archive);
  event L2ProofVerified(uint256 indexed blockNumber, bytes32 indexed proverId);
  event PrunedPending(uint256 provenBlockNumber, uint256 pendingBlockNumber);

  function prune() external;

  function propose(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _blockHash,
    bytes32[] memory _txHashes,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body
  ) external;

  function submitBlockRootProof(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _proverId,
    bytes calldata _aggregationObject,
    bytes calldata _proof
  ) external;

  function canProposeAtTime(uint256 _ts, bytes32 _archive) external view returns (uint256, uint256);
  function validateHeader(
    bytes calldata _header,
    SignatureLib.Signature[] memory _signatures,
    bytes32 _digest,
    uint256 _currentTime,
    bytes32 _txsEffecstHash,
    DataStructures.ExecutionFlags memory _flags
  ) external view;

  function INBOX() external view returns (IInbox);

  function OUTBOX() external view returns (IOutbox);

  function L1_BLOCK_AT_GENESIS() external view returns (uint256);

  function status(uint256 myHeaderBlockNumber)
    external
    view
    returns (
      uint256 provenBlockCount,
      bytes32 provenArchive,
      uint256 pendingBlockCount,
      bytes32 pendingArchive,
      bytes32 archiveOfMyBlock
    );

  // TODO(#7346): Integrate batch rollups
  // function submitRootProof(
  //   bytes32 _previousArchive,
  //   bytes32 _archive,
  //   bytes32 outHash,
  //   address[32] calldata coinbases,
  //   uint256[32] calldata fees,
  //   bytes32 _proverId,
  //   bytes calldata _aggregationObject,
  //   bytes calldata _proof
  // ) external;

  function archive() external view returns (bytes32);
  function archiveAt(uint256 _blockNumber) external view returns (bytes32);
  function getProvenBlockNumber() external view returns (uint256);
  function getPendingBlockNumber() external view returns (uint256);
  function computeTxsEffectsHash(bytes calldata _body) external pure returns (bytes32);
}
