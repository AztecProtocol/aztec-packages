// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

// Interfaces
import {IAvailabilityOracle} from "./../interfaces/IAvailabilityOracle.sol";

// Libraries
import {TxsDecoder} from "./../libraries/decoders/TxsDecoder.sol";

/**
 * @title AvailabilityOracle
 * @author Aztec Labs
 * @notice An availability oracle that uses L1 calldata for publication
 */
contract AvailabilityOracle is IAvailabilityOracle {
  mapping(bytes32 txsHash => bool available) public override(IAvailabilityOracle) isAvailable;
  mapping(bytes32 txsHash => bytes32 blockOutHash) public override(IAvailabilityOracle) outHash;

  /**
   * @notice Publishes transactions and marks its commitment, the TxsEffectsHash, as available
   * @param _body - The block body
   * @return txsEffectsHash - The TxsEffectsHash
   */
  function publish(bytes calldata _body) external override(IAvailabilityOracle) returns (bytes32) {
    (bytes32 txsEffectsHash, bytes32 blockOutHash) = TxsDecoder.decode(_body);
    isAvailable[txsEffectsHash] = true;
    outHash[txsEffectsHash] = blockOutHash;

    emit TxsPublished(txsEffectsHash);

    return txsEffectsHash;
  }
}
