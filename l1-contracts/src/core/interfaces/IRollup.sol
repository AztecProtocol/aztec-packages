// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {SignatureLib} from "../sequencer_selection/SignatureLib.sol";

interface ITestRollup {
  function setDevNet(bool _devNet) external;
  function setVerifier(address _verifier) external;
  function setVkTreeRoot(bytes32 _vkTreeRoot) external;
}

interface IRollup {
  event L2BlockProcessed(uint256 indexed blockNumber);
  event L2ProofVerified(uint256 indexed blockNumber, bytes32 indexed proverId);
  event ProgressedState(uint256 provenBlockCount, uint256 pendingBlockCount);

  function publishAndProcess(
    bytes calldata _header,
    bytes32 _archive,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body
  ) external;
  function publishAndProcess(bytes calldata _header, bytes32 _archive, bytes calldata _body)
    external;
  function process(bytes calldata _header, bytes32 _archive) external;
  function process(
    bytes calldata _header,
    bytes32 _archive,
    SignatureLib.Signature[] memory _signatures
  ) external;

  function submitProof(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _proverId,
    bytes calldata _aggregationObject,
    bytes calldata _proof
  ) external;

  function archive() external view returns (bytes32);
  function isBlockProven(uint256 _blockNumber) external view returns (bool);
  function archiveAt(uint256 _blockNumber) external view returns (bytes32);
}
