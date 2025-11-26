// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {DecoderBase} from "./DecoderBase.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollup, CheckpointLog, SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Strings} from "@oz/utils/Strings.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {NaiveMerkle} from "../merkle/Naive.sol";
import {MerkleTestUtil} from "../merkle/TestUtil.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {BlobLib} from "@aztec-blob-lib/BlobLib.sol";
import {ProposeArgs, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {
  CommitteeAttestation,
  CommitteeAttestations,
  AttestationLib
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";

contract RollupBase is DecoderBase {
  IInstance internal rollup;
  Inbox internal inbox;
  Outbox internal outbox;
  MerkleTestUtil internal merkleTestUtil = new MerkleTestUtil();

  CommitteeAttestation[] internal attestations;
  address[] internal signers;
  Signature internal attestationsAndSignersSignature;

  mapping(uint256 => uint256) internal checkpointFees;

  function _proveCheckpoints(string memory _name, uint256 _start, uint256 _end, address _prover) internal {
    _proveCheckpoints(_name, _start, _end, _prover, "");
  }

  function _proveCheckpointsFail(
    string memory _name,
    uint256 _start,
    uint256 _end,
    address _prover,
    bytes memory _revertMsg
  ) internal {
    _proveCheckpoints(_name, _start, _end, _prover, _revertMsg);
  }

  function _proveCheckpoints(
    string memory _name,
    uint256 _start,
    uint256 _end,
    address _prover,
    bytes memory _revertMsg
  ) private {
    DecoderBase.Full memory startFull = load(string.concat(_name, Strings.toString(_start)));
    DecoderBase.Full memory endFull = load(string.concat(_name, Strings.toString(_end)));

    uint256 startCheckpointNumber = uint256(startFull.checkpoint.checkpointNumber);
    uint256 endCheckpointNumber = uint256(endFull.checkpoint.checkpointNumber);

    assertEq(startCheckpointNumber, _start, "Invalid start checkpoint number");
    assertEq(endCheckpointNumber, _end, "Invalid end checkpoint number");

    CheckpointLog memory parentCheckpointLog = rollup.getCheckpoint(startCheckpointNumber - 1);

    // What are these even?
    // ^ public inputs to the root proof?
    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: parentCheckpointLog.archive, endArchive: endFull.checkpoint.archive, proverId: _prover
    });

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

    uint256 size = endCheckpointNumber - startCheckpointNumber + 1;
    for (uint256 i = 0; i < size; i++) {
      fees[i * 2] = bytes32(uint256(uint160(bytes20(("sequencer"))))); // Need the address to be left padded within the
        // bytes32
      fees[i * 2 + 1] = bytes32(uint256(checkpointFees[startCheckpointNumber + i]));
    }

    // All the way down here if reverting.

    if (_revertMsg.length > 0) {
      vm.expectRevert(_revertMsg);
    }

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: startCheckpointNumber,
        end: endCheckpointNumber,
        args: args,
        fees: fees,
        attestations: CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
        blobInputs: endFull.checkpoint.batchedBlobInputs,
        proof: ""
      })
    );
  }

  function _proposeCheckpoint(string memory _name, uint256 _slotNumber) public {
    _proposeCheckpoint(_name, _slotNumber, 0);
  }

  function _proposeCheckpoint(string memory _name, uint256 _slotNumber, uint256 _manaUsed) public {
    bytes32[] memory extraBlobHashes = new bytes32[](0);
    _proposeCheckpoint(_name, _slotNumber, _manaUsed, extraBlobHashes, "");
  }

  function _proposeCheckpointFail(string memory _name, uint256 _slotNumber, uint256 _manaUsed, bytes memory _revertMsg)
    public
  {
    bytes32[] memory extraBlobHashes = new bytes32[](0);
    _proposeCheckpoint(_name, _slotNumber, _manaUsed, extraBlobHashes, _revertMsg);
  }

  function _proposeCheckpointWithExtraBlobs(
    string memory _name,
    uint256 _slotNumber,
    uint256 _manaUsed,
    bytes32[] memory _extraBlobHashes
  ) public {
    _proposeCheckpoint(_name, _slotNumber, _manaUsed, _extraBlobHashes, "");
  }

  function _proposeCheckpoint(
    string memory _name,
    uint256 _slotNumber,
    uint256 _manaUsed,
    bytes32[] memory _extraBlobHashes,
    bytes memory _revertMsg
  ) private {
    DecoderBase.Full memory full = load(_name);
    bytes memory blobCommitments = full.checkpoint.blobCommitments;

    Slot slotNumber = Slot.wrap(_slotNumber);

    // Overwrite some timestamps if needed
    if (slotNumber != Slot.wrap(0)) {
      Timestamp ts = rollup.getTimestampForSlot(slotNumber);

      full.checkpoint.header.timestamp = ts;
      full.checkpoint.header.slotNumber = slotNumber;
    }

    uint128 baseFee = SafeCast.toUint128(rollup.getManaBaseFeeAt(full.checkpoint.header.timestamp, true));
    full.checkpoint.header.gasFees.feePerL2Gas = baseFee;
    full.checkpoint.header.totalManaUsed = _manaUsed;

    checkpointFees[full.checkpoint.checkpointNumber] = _manaUsed * baseFee;

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, Timestamp.unwrap(full.checkpoint.header.timestamp)));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);
    full.checkpoint.header.contentCommitment.inHash = rollup.getInbox().getRoot(full.checkpoint.checkpointNumber);

    {
      bytes32[] memory blobHashes;
      if (_extraBlobHashes.length == 0) {
        blobHashes = this.getBlobHashes(blobCommitments);
      } else {
        bytes32[] memory originalBlobHashes = this.getBlobHashes(blobCommitments);
        blobHashes = new bytes32[](originalBlobHashes.length + _extraBlobHashes.length);
        for (uint256 i = 0; i < originalBlobHashes.length; i++) {
          blobHashes[i] = originalBlobHashes[i];
        }
        for (uint256 i = 0; i < _extraBlobHashes.length; i++) {
          blobHashes[originalBlobHashes.length + i] = _extraBlobHashes[i];
        }
      }

      // https://github.com/foundry-rs/foundry/issues/10074
      // don't add blob hashes if forge gas report is true
      if (!vm.envOr("FORGE_GAS_REPORT", false)) {
        emit log("Setting blob hashes");
        vm.blobhashes(blobHashes);
      } else {
        // skip blob check if forge gas report is true
        skipBlobCheck(address(rollup));
      }
    }

    ProposeArgs memory args = ProposeArgs({
      header: full.checkpoint.header,
      archive: full.checkpoint.archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0)
    });

    if (_revertMsg.length > 0) {
      vm.expectRevert(_revertMsg);
    }
    rollup.propose(
      args,
      AttestationLibHelper.packAttestations(attestations),
      signers,
      attestationsAndSignersSignature,
      blobCommitments
    );

    if (_revertMsg.length > 0) {
      return;
    }

    bytes32 l2ToL1MessageTreeRoot;
    uint32 numTxs = full.checkpoint.numTxs;
    if (numTxs != 0) {
      // NB: The below works with full checkpoints because we require the largest possible subtrees
      // for L2 to L1 messages - usually we make variable height subtrees, the roots of which
      // form a balanced tree

      // The below is a little janky - we know that this test deals with full txs with equal numbers
      // of msgs or txs with no messages, so the division works
      // TODO edit full.messages to include information about msgs per tx?
      uint256 subTreeHeight = full.messages.l2ToL1Messages.length == 0
        ? 0
        : merkleTestUtil.calculateTreeHeightFromSize(full.messages.l2ToL1Messages.length / numTxs);
      uint256 outHashTreeHeight = numTxs == 1 ? 0 : merkleTestUtil.calculateTreeHeightFromSize(numTxs);
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
    bytes32 root = outbox.getRootData(full.checkpoint.checkpointNumber);

    // If we are trying to read a checkpoint beyond the proven chain, we should see "nothing".
    if (rollup.getProvenCheckpointNumber() >= full.checkpoint.checkpointNumber) {
      assertEq(l2ToL1MessageTreeRoot, root, "Invalid l2 to l1 message tree root");
    } else {
      assertEq(root, bytes32(0), "Invalid outbox root");
    }

    assertEq(rollup.archive(), args.archive, "Invalid archive");
  }

  function _populateInbox(address _sender, bytes32 _recipient, bytes32[] memory _contents) internal {
    if (rollup.getManaTarget() == 0) {
      // If we are in ignition, we cannot populate the inbox.
      return;
    }

    inbox = Inbox(address(rollup.getInbox()));
    uint256 version = rollup.getVersion();

    for (uint256 i = 0; i < _contents.length; i++) {
      vm.prank(_sender);
      inbox.sendL2Message(DataStructures.L2Actor({actor: _recipient, version: version}), _contents[i], bytes32(0));
    }
  }

  function getBlobHashes(bytes calldata _blobCommitments) public pure returns (bytes32[] memory blobHashes) {
    uint8 numBlobs = uint8(_blobCommitments[0]);
    blobHashes = new bytes32[](numBlobs);
    // Add 1 for the numBlobs prefix
    uint256 blobInputStart = 1;
    for (uint256 i = 0; i < numBlobs; i++) {
      // blobInputs = [numBlobs, ...blobCommitments], numBlobs is one byte, each commitment is 48
      blobHashes[i] = BlobLib.calculateBlobHash(
        abi.encodePacked(_blobCommitments[blobInputStart:blobInputStart + Constants.BLS12_POINT_COMPRESSED_BYTES])
      );
      blobInputStart += Constants.BLS12_POINT_COMPRESSED_BYTES;
    }
  }
}
