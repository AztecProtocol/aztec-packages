// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

// Interfaces
import {IRollup} from "./interfaces/IRollup.sol";
import {IInbox} from "./interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "./interfaces/messagebridge/IOutbox.sol";
import {IRegistry} from "./interfaces/messagebridge/IRegistry.sol";

// Libraries
import {HeaderDecoder} from "./libraries/decoders/HeaderDecoder.sol";
import {MessagesDecoder} from "./libraries/decoders/MessagesDecoder.sol";
import {Hash} from "./libraries/Hash.sol";
import {Errors} from "./libraries/Errors.sol";

// Contracts
import {MockVerifier} from "../mock/MockVerifier.sol";
import {AvailabilityOracle} from "./availability_oracle/AvailabilityOracle.sol";

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice Rollup contract that are concerned about readability and velocity of development
 * not giving a damn about gas costs.
 */
contract Rollup is IRollup {
  MockVerifier public immutable VERIFIER;
  IRegistry public immutable REGISTRY;
  uint256 public immutable VERSION;
  AvailabilityOracle public immutable AVAILABILITY_ORACLE;

  bytes32 public archive; // Root of the archive tree
  uint256 public lastBlockTs;
  // Tracks the last time time was warped on L2 ("warp" is the testing cheatcode).
  // See https://github.com/AztecProtocol/aztec-packages/issues/1614
  uint256 public lastWarpedBlockTs;

  constructor(IRegistry _registry) {
    VERIFIER = new MockVerifier();
    AVAILABILITY_ORACLE = new AvailabilityOracle();
    REGISTRY = _registry;
    VERSION = 1;
  }

  /**
   * @notice Process an incoming L2 block and progress the state
   * @param _header - The L2 block header.
   * @param _archive - A snapshot (root and next available leaf index) of the archive tree after the L2 block is applied
   * @param _body - The L2 block body.
   * @param _proof - The proof of correct execution.
   */
  function process(
    bytes calldata _header,
    bytes calldata _archive,
    bytes calldata _body, // Note: this will be replaced with _txsHash once the separation is finished.
    bytes memory _proof
  ) external override(IRollup) {
    // TODO: @benejsan Should we represent this values from header as a nice struct?
    HeaderDecoder.Header memory header = HeaderDecoder.decode(_header);

    _validateHeader(header);

    // Check if the data is available using availability oracle (change availability oracle if you want a different DA layer)
    bytes32 txsHash;
    {
      // @todo @LHerskind Hack such that the node is unchanged for now.
      // should be removed when we have a proper block publication.
      txsHash = AVAILABILITY_ORACLE.publish(_body);
    }

    if (!AVAILABILITY_ORACLE.isAvailable(txsHash)) {
      // @todo @LHerskind Impossible to hit with above hack.
      revert Errors.Rollup__UnavailableTxs(txsHash);
    }

    // Decode the cross-chain messages
    (bytes32 inHash,, bytes32[] memory l1ToL2Msgs, bytes32[] memory l2ToL1Msgs) =
      MessagesDecoder.decode(_body);

    // @todo @LHerskind Proper genesis state. If the state is empty, we allow anything for now.
    // TODO(#3936): Temporarily disabling this because L2Block encoding has not yet been updated.
    // if (rollupStateHash != bytes32(0) && rollupStateHash != oldStateHash) {
    //   revert Errors.Rollup__InvalidStateHash(rollupStateHash, oldStateHash);
    // }

    bytes32[] memory publicInputs = new bytes32[](1);
    publicInputs[0] = _computePublicInputHash(_header, txsHash, inHash);

    if (!VERIFIER.verify(_proof, publicInputs)) {
      revert Errors.Rollup__InvalidProof();
    }

    // TODO: @benejsan Manually extracting the root here is ugly. TODO: Re-think how to represent archive snap.
    archive = bytes32(_archive[:0x20]);
    lastBlockTs = block.timestamp;

    // @todo (issue #605) handle fee collector
    IInbox inbox = REGISTRY.getInbox();
    inbox.batchConsume(l1ToL2Msgs, msg.sender);

    IOutbox outbox = REGISTRY.getOutbox();
    outbox.sendL1Messages(l2ToL1Msgs);

    emit L2BlockProcessed(header.blockNumber);
  }

  function _validateHeader(HeaderDecoder.Header memory header) internal view {
    if (block.chainid != header.chainId) {
      revert Errors.Rollup__InvalidChainId(header.chainId, block.chainid);
    }

    if (header.version != VERSION) {
      revert Errors.Rollup__InvalidVersion(header.version, VERSION);
    }

    if (header.timestamp > block.timestamp) {
      revert Errors.Rollup__TimestampInFuture();
    }

    // @todo @LHerskind consider if this is too strict
    // This will make multiple l2 blocks in the same l1 block impractical.
    // e.g., the first block will update timestamp which will make the second fail.
    // Could possibly allow multiple blocks if in same l1 block
    if (header.timestamp < lastBlockTs) {
      revert Errors.Rollup__TimestampTooOld();
    }

    // @todo @LHerskind Proper genesis state. If the state is empty, we allow anything for now.
    if (archive != bytes32(0) && archive != header.lastArchive) {
      revert Errors.Rollup__InvalidArchive(archive, header.lastArchive);
    }
  }

  function _computePublicInputHash(bytes calldata _header, bytes32 _txsHash, bytes32 _inHash)
    internal
    pure
    returns (bytes32)
  {
    return Hash.sha256ToField(bytes.concat(_header, _txsHash, _inHash));
  }
}
