// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

// Interfaces
import {IRollup} from "./interfaces/IRollup.sol";
import {IAvailabilityOracle} from "./interfaces/IAvailabilityOracle.sol";
import {IInbox} from "./interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "./interfaces/messagebridge/IOutbox.sol";
import {IRegistry} from "./interfaces/messagebridge/IRegistry.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

// Libraries
import {HeaderLib} from "./libraries/HeaderLib.sol";
import {Hash} from "./libraries/Hash.sol";
import {Errors} from "./libraries/Errors.sol";
import {Constants} from "./libraries/ConstantsGen.sol";

// Contracts
import {MockVerifier} from "../mock/MockVerifier.sol";
import {Inbox} from "./messagebridge/Inbox.sol";
import {Outbox} from "./messagebridge/Outbox.sol";

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice Rollup contract that is concerned about readability and velocity of development
 * not giving a damn about gas costs.
 */
contract Rollup is IRollup {
  IVerifier public verifier;
  IRegistry public immutable REGISTRY;
  IAvailabilityOracle public immutable AVAILABILITY_ORACLE;
  IInbox public immutable INBOX;
  IOutbox public immutable OUTBOX;
  uint256 public immutable VERSION;
  IERC20 public immutable GAS_TOKEN;

  bytes32 public archive; // Root of the archive tree
  uint256 public lastBlockTs;
  // Tracks the last time time was warped on L2 ("warp" is the testing cheatcode).
  // See https://github.com/AztecProtocol/aztec-packages/issues/1614
  uint256 public lastWarpedBlockTs;

  constructor(IRegistry _registry, IAvailabilityOracle _availabilityOracle, IERC20 _gasToken) {
    verifier = new MockVerifier();
    REGISTRY = _registry;
    AVAILABILITY_ORACLE = _availabilityOracle;
    GAS_TOKEN = _gasToken;
    INBOX = new Inbox(address(this), Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT);
    OUTBOX = new Outbox(address(this));
    VERSION = 1;
  }

  function setVerifier(address _verifier) external override(IRollup) {
    // TODO remove, only needed for testing
    verifier = IVerifier(_verifier);
  }

  /**
   * @notice Process an incoming L2 block and progress the state
   * @param _header - The L2 block header
   * @param _archive - A root of the archive tree after the L2 block is applied
   * @param _proof - The proof of correct execution
   */
  function process(
    bytes calldata _header,
    bytes32 _archive,
    bytes calldata _aggregationObject,
    bytes calldata _proof
  ) external override(IRollup) {
    // Decode and validate header
    HeaderLib.Header memory header = HeaderLib.decode(_header);
    HeaderLib.validate(header, VERSION, lastBlockTs, archive);

    // Check if the data is available using availability oracle (change availability oracle if you want a different DA layer)
    if (!AVAILABILITY_ORACLE.isAvailable(header.contentCommitment.txsEffectsHash)) {
      revert Errors.Rollup__UnavailableTxs(header.contentCommitment.txsEffectsHash);
    }

    bytes32[] memory publicInputs =
      new bytes32[](2 + Constants.HEADER_LENGTH + Constants.AGGREGATION_OBJECT_LENGTH);
    // the archive tree root
    publicInputs[0] = _archive;
    // this is the _next_ available leaf in the archive tree
    // normally this should be equal to the block number (since leaves are 0-indexed and blocks 1-indexed)
    // but in yarn-project/merkle-tree/src/new_tree.ts we prefill the tree so that block N is in leaf N
    publicInputs[1] = bytes32(header.globalVariables.blockNumber + 1);

    bytes32[] memory headerFields = HeaderLib.toFields(header);
    for (uint256 i = 0; i < headerFields.length; i++) {
      publicInputs[i + 2] = headerFields[i];
    }

    // the block proof is recursive, which means it comes with an aggregation object
    // this snippet copies it into the public inputs needed for verification
    // it also guards against empty _aggregationObject used with mocked proofs
    uint256 aggregationLength = _aggregationObject.length / 32;
    for (uint256 i = 0; i < Constants.AGGREGATION_OBJECT_LENGTH && i < aggregationLength; i++) {
      bytes32 part;
      assembly {
        part := calldataload(add(_aggregationObject.offset, mul(i, 32)))
      }
      publicInputs[i + 2 + Constants.HEADER_LENGTH] = part;
    }

    if (!verifier.verify(_proof, publicInputs)) {
      revert Errors.Rollup__InvalidProof();
    }

    archive = _archive;
    lastBlockTs = block.timestamp;

    bytes32 inHash = INBOX.consume();
    if (header.contentCommitment.inHash != inHash) {
      revert Errors.Rollup__InvalidInHash(inHash, header.contentCommitment.inHash);
    }

    // We assume here that the number of L2 to L1 messages per tx is 2. Therefore we just need a tree that is one height
    // larger (as we can just extend the tree one layer down to hold all the L2 to L1 messages)
    uint256 l2ToL1TreeHeight = header.contentCommitment.txTreeHeight + 1;
    OUTBOX.insert(
      header.globalVariables.blockNumber, header.contentCommitment.outHash, l2ToL1TreeHeight
    );

    // pay the coinbase 1 gas token if it is not empty and header.totalFees is not zero
    if (header.globalVariables.coinbase != address(0) && header.totalFees > 0) {
      GAS_TOKEN.transfer(address(header.globalVariables.coinbase), header.totalFees);
    }

    emit L2BlockProcessed(header.globalVariables.blockNumber);
  }

  function _computePublicInputHash(bytes calldata _header, bytes32 _archive)
    internal
    pure
    returns (bytes32)
  {
    return Hash.sha256ToField(bytes.concat(_header, _archive));
  }
}
