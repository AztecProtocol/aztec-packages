// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";

import {Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";

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

  /**
   * @notice Struct for storing flags for block header validation
   * @param ignoreDA - True will ignore DA check, otherwise checks
   * @param ignoreSignature - True will ignore the signatures, otherwise checks
   */
  struct ExecutionFlags {
    bool ignoreDA;
    bool ignoreSignatures;
  }

  /**
   * @notice Struct encompassing an epoch proof quote
   * @param epochToProve - The epoch number to prove
   * @param validUntilSlot - The deadline of the quote, denoted in L2 slots
   * @param bondAmount - The size of the bond
   * @param prover - The address of the prover
   * @param basisPointFee - The fee measured in basis points
   */
  struct EpochProofQuote {
    Epoch epochToProve;
    Slot validUntilSlot;
    uint256 bondAmount;
    address prover;
    uint32 basisPointFee;
  }

  /**
   * @notice A signed quote for the epoch proof
   * @param quote - The Epoch Proof Quote
   * @param signature - A signature on the quote
   */
  struct SignedEpochProofQuote {
    EpochProofQuote quote;
    SignatureLib.Signature signature;
  }

  /**
   * @notice Struct containing the Epoch Proof Claim
   * @param epochToProve - the epoch that the bond provider is claiming to prove
   * @param basisPointFee the fee that the bond provider will receive as a percentage of the block rewards
   * @param bondAmount - the size of the bond
   * @param bondProvider - the address that put up the bond
   * @param proposerClaimant - the address of the proposer that submitted the claim
   */
  struct EpochProofClaim {
    Epoch epochToProve;
    uint256 basisPointFee;
    uint256 bondAmount;
    address bondProvider;
    address proposerClaimant;
  }
}
