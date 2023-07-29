// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

interface IDecoder {
  /**
   * @notice Decodes the inputs and computes values to check state against
   * @param _l2Block - The L2 block calldata.
   * @return l2BlockNumber  - The L2 block number.
   * @return startStateHash - The state hash expected prior the execution.
   * @return endStateHash - The state hash expected after the execution.
   * @return publicInputHash - The hash of the public inputs
   * @return l2ToL1Msgs - The L2 to L1 messages
   * @return l1ToL2Msgs - The L1 to L2 messages
   */
  function decode(bytes calldata _l2Block)
    external
    pure
    returns (
      uint256 l2BlockNumber,
      bytes32 startStateHash,
      bytes32 endStateHash,
      bytes32 publicInputHash,
      bytes32[] memory l2ToL1Msgs,
      bytes32[] memory l1ToL2Msgs
    );
}
