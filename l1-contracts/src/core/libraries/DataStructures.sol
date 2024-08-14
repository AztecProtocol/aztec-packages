// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

/**
 * @title Data Structures Library
 * @author Aztec Labs
 * @notice Library that contains data structures used throughout the Aztec protocol
 */
library DataStructures {
  // docs:start:l1_actor
  /**
   * @notice Actor on L1.
   * @param actor - The address of the actor
   * @param chainId - The chainId of the actor
   */
  struct L1Actor {
    address actor;
    uint256 chainId;
  }
  // docs:end:l1_actor

  // docs:start:l2_actor
  /**
   * @notice Actor on L2.
   * @param actor - The aztec address of the actor
   * @param version - Ahe Aztec instance the actor is on
   */
  struct L2Actor {
    bytes32 actor;
    uint256 version;
  }
  // docs:end:l2_actor

  // docs:start:l1_to_l2_msg
  /**
   * @notice Struct containing a message from L1 to L2
   * @param sender - The sender of the message
   * @param recipient - The recipient of the message
   * @param content - The content of the message (application specific) padded to bytes32 or hashed if larger.
   * @param secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed on L2).
   */
  struct L1ToL2Msg {
    L1Actor sender;
    L2Actor recipient;
    bytes32 content;
    bytes32 secretHash;
  }
  // docs:end:l1_to_l2_msg

  // docs:start:l2_to_l1_msg
  /**
   * @notice Struct containing a message from L2 to L1
   * @param sender - The sender of the message
   * @param recipient - The recipient of the message
   * @param content - The content of the message (application specific) padded to bytes32 or hashed if larger.
   * @dev Not to be confused with L2ToL1Message in Noir circuits
   */
  struct L2ToL1Msg {
    DataStructures.L2Actor sender;
    DataStructures.L1Actor recipient;
    bytes32 content;
  }
  // docs:end:l2_to_l1_msg

  // docs:start:registry_snapshot
  /**
   * @notice Struct for storing address of cross communication components and the block number when it was updated
   * @param rollup - The address of the rollup contract
   * @param blockNumber - The block number of the snapshot
   */
  struct RegistrySnapshot {
    address rollup;
    uint256 blockNumber;
  }
  // docs:end:registry_snapshot
}
