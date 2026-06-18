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
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
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
  mapping(uint256 => ProposedHeader) internal proposedHeaders;

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
      previousArchive: parentCheckpointLog.archive,
      endArchive: endFull.checkpoint.archive,
      outHash: endFull.checkpoint.header.outHash,
      proverId: _prover
    });

    uint256 size = endCheckpointNumber - startCheckpointNumber + 1;
    ProposedHeader[] memory headers = new ProposedHeader[](size);
    for (uint256 i = 0; i < size; i++) {
      headers[i] = proposedHeaders[startCheckpointNumber + i];
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
        headers: headers,
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

    uint128 minFee = SafeCast.toUint128(rollup.getManaMinFeeAt(full.checkpoint.header.timestamp, true));
    full.checkpoint.header.gasFees.feePerL2Gas = minFee;
    full.checkpoint.header.totalManaUsed = _manaUsed;
    full.checkpoint.header.accumulatedFees = _manaUsed * minFee;
    // Sequencer rewards are credited to the verified header's coinbase, so pin it to a known address tests can assert
    // on.
    full.checkpoint.header.coinbase = address(bytes20("sequencer"));

    checkpointFees[full.checkpoint.checkpointNumber] = _manaUsed * minFee;

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, Timestamp.unwrap(full.checkpoint.header.timestamp)));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);
    full.checkpoint.header.inHash = rollup.getInbox().getRoot(full.checkpoint.checkpointNumber);

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

    proposedHeaders[full.checkpoint.checkpointNumber] = full.checkpoint.header;

    ProposeArgs memory args =
      ProposeArgs({header: full.checkpoint.header, archive: full.checkpoint.archive, oracleInput: OracleInput(0)});

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

    assertEq(rollup.archive(), args.archive, "Invalid archive");
  }

  function _populateInbox(address _sender, bytes32 _recipient, bytes32[] memory _contents) internal {
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
