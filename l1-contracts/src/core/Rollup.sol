// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {Decoder} from "./Decoder.sol";

import {IInbox} from "@aztec/interfaces/message_bridge/IInbox.sol";
// Messaging
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Registry} from "@aztec/core/messagebridge/Registry.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice Rollup contract that are concerned about readability and velocity of development
 * not giving a damn about gas costs.
 *
 * Work in progress
 */
contract Rollup is Decoder {
  error InvalidStateHash(bytes32 expected, bytes32 actual);
  error InvalidProof();

  event L2BlockProcessed(uint256 indexed blockNum);

  MockVerifier public immutable VERIFIER;
  Registry public immutable REGISTRY;
  Inbox public immutable INBOX;
  Outbox public immutable OUTBOX;

  bytes32 public rollupStateHash;

  constructor() {
    VERIFIER = new MockVerifier();

    // TODO(maddiaa): refector deploying each of these, this is just quick n easy
    REGISTRY = new Registry();
    INBOX = new Inbox(address(REGISTRY));
    OUTBOX = new Outbox(address(REGISTRY));

    REGISTRY.setAddresses(address(this), address(INBOX), address(OUTBOX));
  }

  /**
   * @notice Process an incoming L2Block and progress the state
   * @param _proof - The proof of correct execution
   * @param _l2Block - The L2Block data, formatted as outlined in `Decoder.sol`
   */
  function process(bytes memory _proof, bytes calldata _l2Block) external {
    (uint256 l2BlockNumber, bytes32 oldStateHash, bytes32 newStateHash, bytes32 publicInputHash) =
      _decode(_l2Block);

    // @todo Proper genesis state. If the state is empty, we allow anything for now.
    if (rollupStateHash != bytes32(0) && rollupStateHash != oldStateHash) {
      revert InvalidStateHash(rollupStateHash, oldStateHash);
    }

    bytes32[] memory publicInputs = new bytes32[](1);
    publicInputs[0] = publicInputHash;

    if (!VERIFIER.verify(_proof, publicInputs)) {
      revert InvalidProof();
    }

    rollupStateHash = newStateHash;

    emit L2BlockProcessed(l2BlockNumber);
  }
}
