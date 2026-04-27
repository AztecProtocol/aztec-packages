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

  function freeze() external;

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

  function withdrawPendingMessage(
    address _recipient,
    uint256 _amount,
    uint256 _epochNumber,
    uint256 _leafIndex,
    bytes32[] calldata _frozenPath,
    bytes32[] calldata _currentPath,
    bytes32 _withdrawalDigest,
    bytes calldata _teeSignature
  ) external;

  /**
   * @notice Exit directly from notes proven against a frozen archive.
   * @dev `_nullifiers` is padded by the portal to `TEEPortal.FORCED_EXIT_NULLIFIER_COUNT`
   *      public input slots before proof verification.
   */
  function withdrawFrozenNotes(
    address _recipient,
    uint256 _amount,
    bytes32[] calldata _nullifiers,
    bytes calldata _proof,
    bytes calldata _teeSignature
  ) external;

  function isRegisteredTee(address _tee) external view returns (bool);
}
