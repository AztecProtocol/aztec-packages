// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

interface IRollup {
  event L2BlockProcessed(uint256 indexed blockNumber);
  event L2ProofVerified(uint256 indexed blockNumber, bytes32 indexed proverId);
  event ProgressedState(uint256 provenBlockCount, uint256 pendingBlockCount);

  function process(bytes calldata _header, bytes32 _archive) external;

  function submitBlockRootProof(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _proverId,
    // bytes32 _previousBlockHash,
    bytes32 _currentBlockHash,
    bytes calldata _aggregationObject,
    bytes calldata _proof
  ) external;

  // TODO(#7346): Integrate batch rollups
  // function submitRootProof(
  //   bytes32 _previousArchive,
  //   bytes32 _archive,
  //   bytes32 _previousBlockHash,
  //   bytes32 _currentBlockHash,
  //   bytes32 outHash,
  //   address[32] calldata coinbases,
  //   uint256[32] calldata fees,
  //   bytes32 _proverId,
  //   bytes calldata _aggregationObject,
  //   bytes calldata _proof
  // ) external;

  function setVerifier(address _verifier) external;
}
