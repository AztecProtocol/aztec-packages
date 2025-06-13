// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {DecoderBase} from "./DecoderBase.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {
  IRollup,
  BlockLog,
  SubmitEpochRootProofArgs,
  PublicInputArgs
} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Strings} from "@oz/utils/Strings.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {NaiveMerkle} from "../merkle/Naive.sol";
import {MerkleTestUtil} from "../merkle/TestUtil.sol";
import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {BlobLib} from "@aztec/core/libraries/rollup/BlobLib.sol";
import {ProposeArgs, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {CommitteeAttestation} from "@aztec/shared/libraries/SignatureLib.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";

contract RollupBase is DecoderBase {
  IInstance internal rollup;
  Inbox internal inbox;
  Outbox internal outbox;
  MerkleTestUtil internal merkleTestUtil = new MerkleTestUtil();

  CommitteeAttestation[] internal attestations;

  mapping(uint256 => uint256) internal blockFees;

  function _proveBlocks(string memory _name, uint256 _start, uint256 _end, address _prover)
    internal
  {
    _proveBlocks(_name, _start, _end, _prover, "");
  }

  function _proveBlocksFail(
    string memory _name,
    uint256 _start,
    uint256 _end,
    address _prover,
    bytes memory _revertMsg
  ) internal {
    _proveBlocks(_name, _start, _end, _prover, _revertMsg);
  }

  function _proveBlocks(
    string memory _name,
    uint256 _start,
    uint256 _end,
    address _prover,
    bytes memory _revertMsg
  ) private {
    DecoderBase.Full memory startFull = load(string.concat(_name, Strings.toString(_start)));
    DecoderBase.Full memory endFull = load(string.concat(_name, Strings.toString(_end)));

    uint256 startBlockNumber = uint256(startFull.block.blockNumber);
    uint256 endBlockNumber = uint256(endFull.block.blockNumber);

    assertEq(startBlockNumber, _start, "Invalid start block number");
    assertEq(endBlockNumber, _end, "Invalid end block number");

    BlockLog memory parentBlockLog = rollup.getBlock(startBlockNumber - 1);

    // What are these even?
    // ^ public inputs to the root proof?
    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: parentBlockLog.archive,
      endArchive: endFull.block.archive,
      proverId: _prover
    });

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

    uint256 size = endBlockNumber - startBlockNumber + 1;
    for (uint256 i = 0; i < size; i++) {
      fees[i * 2] = bytes32(uint256(uint160(bytes20(("sequencer"))))); // Need the address to be left padded within the bytes32
      fees[i * 2 + 1] = bytes32(uint256(blockFees[startBlockNumber + i]));
    }

    // All the way down here if reverting.

    if (_revertMsg.length > 0) {
      vm.expectRevert(_revertMsg);
    }

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: startBlockNumber,
        end: endBlockNumber,
        args: args,
        fees: fees,
        blobInputs: endFull.block.batchedBlobInputs,
        proof: ""
      })
    );
  }

  function _proposeBlock(string memory _name, uint256 _slotNumber) public {
    _proposeBlock(_name, _slotNumber, 0);
  }

  function _proposeBlock(string memory _name, uint256 _slotNumber, uint256 _manaUsed) public {
    _proposeBlock(_name, _slotNumber, _manaUsed, "");
  }

  function _proposeBlockFail(
    string memory _name,
    uint256 _slotNumber,
    uint256 _manaUsed,
    bytes memory _revertMsg
  ) public {
    _proposeBlock(_name, _slotNumber, _manaUsed, _revertMsg);
  }

  function _proposeBlock(
    string memory _name,
    uint256 _slotNumber,
    uint256 _manaUsed,
    bytes memory _revertMsg
  ) private {
    DecoderBase.Full memory full = load(_name);
    bytes memory blobCommitments = full.block.blobCommitments;

    Slot slotNumber = Slot.wrap(_slotNumber);

    // Overwrite some timestamps if needed
    if (slotNumber != Slot.wrap(0)) {
      Timestamp ts = rollup.getTimestampForSlot(slotNumber);

      full.block.header.timestamp = ts;
      full.block.header.slotNumber = slotNumber;
    }

    uint128 baseFee = SafeCast.toUint128(rollup.getManaBaseFeeAt(full.block.header.timestamp, true));
    full.block.header.gasFees.feePerL2Gas = baseFee;
    full.block.header.totalManaUsed = _manaUsed;

    blockFees[full.block.blockNumber] = _manaUsed * baseFee;

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, Timestamp.unwrap(full.block.header.timestamp)));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);
    full.block.header.contentCommitment.inHash = rollup.getInbox().getRoot(full.block.blockNumber);

    {
      bytes32[] memory blobHashes = this.getBlobHashes(blobCommitments);
      // https://github.com/foundry-rs/foundry/issues/10074
      // don't add blob hashes if forge gas report is true
      if (!vm.envOr("FORGE_GAS_REPORT", false)) {
        vm.blobhashes(blobHashes);
      } else {
        // skip blob check if forge gas report is true
        skipBlobCheck(address(rollup));
      }
    }

    ProposeArgs memory args = ProposeArgs({
      header: full.block.header,
      archive: full.block.archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0),
      txHashes: new bytes32[](0)
    });

    if (_revertMsg.length > 0) {
      vm.expectRevert(_revertMsg);
    }
    rollup.propose(args, attestations, blobCommitments);

    if (_revertMsg.length > 0) {
      return;
    }

    bytes32 l2ToL1MessageTreeRoot;
    uint32 numTxs = full.block.numTxs;
    if (numTxs != 0) {
      // NB: The below works with full blocks because we require the largest possible subtrees
      // for L2 to L1 messages - usually we make variable height subtrees, the roots of which
      // form a balanced tree

      // The below is a little janky - we know that this test deals with full txs with equal numbers
      // of msgs or txs with no messages, so the division works
      // TODO edit full.messages to include information about msgs per tx?
      uint256 subTreeHeight = full.messages.l2ToL1Messages.length == 0
        ? 0
        : merkleTestUtil.calculateTreeHeightFromSize(full.messages.l2ToL1Messages.length / numTxs);
      uint256 outHashTreeHeight =
        numTxs == 1 ? 0 : merkleTestUtil.calculateTreeHeightFromSize(numTxs);
      uint256 numMessagesWithPadding = numTxs * Constants.MAX_L2_TO_L1_MSGS_PER_TX;

      uint256 treeHeight = subTreeHeight + outHashTreeHeight;
      NaiveMerkle tree = new NaiveMerkle(treeHeight);
      for (uint256 i = 0; i < numMessagesWithPadding; i++) {
        if (i < full.messages.l2ToL1Messages.length) {
          tree.insertLeaf(full.messages.l2ToL1Messages[i]);
        } else {
          tree.insertLeaf(bytes32(0));
        }
      }

      l2ToL1MessageTreeRoot = tree.computeRoot();
    }

    outbox = Outbox(address(rollup.getOutbox()));
    bytes32 root = outbox.getRootData(full.block.blockNumber);

    // If we are trying to read a block beyond the proven chain, we should see "nothing".
    if (rollup.getProvenBlockNumber() >= full.block.blockNumber) {
      assertEq(l2ToL1MessageTreeRoot, root, "Invalid l2 to l1 message tree root");
    } else {
      assertEq(root, bytes32(0), "Invalid outbox root");
    }

    assertEq(rollup.archive(), args.archive, "Invalid archive");
  }

  function _populateInbox(address _sender, bytes32 _recipient, bytes32[] memory _contents) internal {
    inbox = Inbox(address(rollup.getInbox()));
    uint256 version = rollup.getVersion();

    for (uint256 i = 0; i < _contents.length; i++) {
      vm.prank(_sender);
      inbox.sendL2Message(
        DataStructures.L2Actor({actor: _recipient, version: version}), _contents[i], bytes32(0)
      );
    }
  }

  function getBlobHashes(bytes calldata _blobCommitments)
    public
    pure
    returns (bytes32[] memory blobHashes)
  {
    uint8 numBlobs = uint8(_blobCommitments[0]);
    blobHashes = new bytes32[](numBlobs);
    // Add 1 for the numBlobs prefix
    uint256 blobInputStart = 1;
    for (uint256 i = 0; i < numBlobs; i++) {
      // blobInputs = [numBlobs, ...blobCommitments], numBlobs is one byte, each commitment is 48
      blobHashes[i] = BlobLib.calculateBlobHash(
        abi.encodePacked(
          _blobCommitments[blobInputStart:blobInputStart + Constants.BLS12_POINT_COMPRESSED_BYTES]
        )
      );
      blobInputStart += Constants.BLS12_POINT_COMPRESSED_BYTES;
    }
  }
}
