// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

// Libraries
import {TxsDecoder} from "./../libraries/decoders/TxsDecoder.sol";

/**
 * @title AvailabilityOracle
 * @author Aztec Labs
 * @notice An availability oracle that uses L1 calldata for publication
 */
contract AvailabilityOracle {
  mapping(bytes32 txsHash => bool available) public isAvailable;

  /**
   * @notice Publishes transactions and marks its commitment, the TxsHash, as available
   * @param _body - The L1 calldata
   * @return txsHash - The TxsHash
   */
  function publish(bytes calldata _body) external returns (bytes32) {
    bytes32 _txsHash = TxsDecoder.decode(_body);
    isAvailable[_txsHash] = true;
    return _txsHash;
  }
}
