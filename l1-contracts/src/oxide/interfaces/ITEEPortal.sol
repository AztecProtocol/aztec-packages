// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

interface ITEEPortal {
  /**
   * @notice Binding between a TEE's L1 Secp256k1 identity (`address tee`) and its
   *         L2 Grumpkin identity (`grumpkinX`, `grumpkinY`). The Grumpkin key is
   *         propagated to L2 via an L1 -> L2 message emitted from `addTee` so the
   *         L2 bridge populates its own `approved_signers` map from L1 registry
   *         state instead of trusting arbitrary public writes.
   */
  struct TeeBinding {
    bool registered;
    bytes32 grumpkinX;
    bytes32 grumpkinY;
  }

  function addTee(address _tee, bytes32 _grumpkinX, bytes32 _grumpkinY) external returns (bytes32 key, uint256 index);

  function initialize(bytes32 _l2Bridge) external;

  function deposit(bytes32 _recipientHash, uint256 _amount, bytes calldata _predicateAuth)
    external
    returns (bytes32 key, uint256 index);

  function withdraw(
    address _recipient,
    uint256 _amount,
    uint256 _epochNumber,
    uint256 _leafIndex,
    bytes32[] calldata _path,
    uint256 _checkpointNumber,
    bytes32 _withdrawalDigest,
    bytes calldata _teeSignature
  ) external;

  function isRegisteredTee(address _tee) external view returns (bool);
}
