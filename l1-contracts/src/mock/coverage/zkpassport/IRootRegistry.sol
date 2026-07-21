// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

interface IRootRegistry {
  function latestRoot(bytes32 identifier) external view returns (bytes32);
  function isRootValid(bytes32 identifier, bytes32 root, uint256 timestamp) external view returns (bool);
  function isRootValidAtTimestamp(bytes32 identifier, bytes32 root, uint256 timestamp) external view returns (bool);
}
