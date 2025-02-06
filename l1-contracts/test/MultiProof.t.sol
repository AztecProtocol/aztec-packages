// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./decoders/Base.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {
  EpochProofQuote,
  SignedEpochProofQuote
} from "@aztec/core/libraries/RollupLibs/EpochProofQuoteLib.sol";
import {Math} from "@oz/utils/math/Math.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {BlockLog, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {FeeJuicePortal} from "@aztec/core/FeeJuicePortal.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {
  ProposeArgs, OracleInput, ProposeLib
} from "@aztec/core/libraries/RollupLibs/ProposeLib.sol";

import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";

import {Rollup, Config} from "@aztec/core/Rollup.sol";
import {Strings} from "@oz/utils/Strings.sol";

// solhint-disable comprehensive-interface

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract MultiProofTest is DecoderBase {
  using SlotLib for Slot;
  using EpochLib for Epoch;
  using ProposeLib for ProposeArgs;
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  Registry internal registry;
  Inbox internal inbox;
  Outbox internal outbox;
  Rollup internal rollup;
  MerkleTestUtil internal merkleTestUtil;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;
  IProofCommitmentEscrow internal proofCommitmentEscrow;
  RewardDistributor internal rewardDistributor;
  Signature[] internal signatures;

  EpochProofQuote internal quote;
  SignedEpochProofQuote internal signedQuote;

  uint256 internal privateKey;
  address internal signer;

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;

  constructor() {
    TimeLib.initialize(
      block.timestamp, TestConstants.AZTEC_SLOT_DURATION, TestConstants.AZTEC_EPOCH_DURATION
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
    EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
  }

  /**
   * @notice  Set up the contracts needed for the tests with time aligned to the provided block name
   */
  modifier setUpFor(string memory _name) {
    {
      testERC20 = new TestERC20("test", "TEST", address(this));

      DecoderBase.Full memory full = load(_name);
      uint256 slotNumber = full.block.decodedHeader.globalVariables.slotNumber;
      uint256 initialTime =
        full.block.decodedHeader.globalVariables.timestamp - slotNumber * SLOT_DURATION;
      vm.warp(initialTime);
    }

    registry = new Registry(address(this));
    feeJuicePortal = new FeeJuicePortal(
      address(registry), address(testERC20), bytes32(Constants.FEE_JUICE_ADDRESS)
    );
    testERC20.mint(address(feeJuicePortal), Constants.FEE_JUICE_INITIAL_MINT);
    feeJuicePortal.initialize();
    rewardDistributor = new RewardDistributor(testERC20, registry, address(this));
    testERC20.mint(address(rewardDistributor), 1e6 ether);

    rollup = new Rollup(
      feeJuicePortal,
      rewardDistributor,
      testERC20,
      bytes32(0),
      bytes32(0),
      address(this),
      Config({
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        targetCommitteeSize: TestConstants.AZTEC_TARGET_COMMITTEE_SIZE,
        aztecEpochProofClaimWindowInL2Slots: TestConstants.AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS,
        minimumStake: TestConstants.AZTEC_MINIMUM_STAKE,
        slashingQuorum: TestConstants.AZTEC_SLASHING_QUORUM,
        slashingRoundSize: TestConstants.AZTEC_SLASHING_ROUND_SIZE
      })
    );
    inbox = Inbox(address(rollup.INBOX()));
    outbox = Outbox(address(rollup.OUTBOX()));
    proofCommitmentEscrow = IProofCommitmentEscrow(address(rollup.PROOF_COMMITMENT_ESCROW()));

    registry.upgrade(address(rollup));

    merkleTestUtil = new MerkleTestUtil();

    privateKey = 0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234;
    signer = vm.addr(privateKey);
    uint256 bond = rollup.PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST();
    quote = EpochProofQuote({
      epochToProve: Epoch.wrap(0),
      validUntilSlot: Slot.wrap(1),
      bondAmount: bond,
      prover: signer,
      basisPointFee: 500
    });
    signedQuote = _quoteToSignedQuote(quote);

    testERC20.mint(signer, bond * 10);
    vm.prank(signer);
    testERC20.approve(address(proofCommitmentEscrow), bond * 10);
    vm.prank(signer);
    proofCommitmentEscrow.deposit(bond * 10);

    _;
  }

  function warpToL2Slot(uint256 _slot) public {
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(_slot))));
  }

  function logStatus() public {
    uint256 provenBlockNumber = rollup.getProvenBlockNumber();
    uint256 pendingBlockNumber = rollup.getPendingBlockNumber();
    emit log_named_uint("proven block number", provenBlockNumber);
    emit log_named_uint("pending block number", pendingBlockNumber);

    address[2] memory provers = [address(bytes20("lasse")), address(bytes20("mitch"))];
    address sequencer = address(bytes20("sequencer"));

    emit log_named_decimal_uint("sequencer rewards", rollup.sequenceRewards(sequencer), 18);
    emit log_named_decimal_uint("prover rewards", rollup.getProverRewards(Epoch.wrap(0)), 18);

    for (uint256 i = 0; i < provers.length; i++) {
      for (uint256 j = 1; j <= provenBlockNumber; j++) {
        bool hasSubmitted = rollup.hasSubmittedProofFor(provers[i], Epoch.wrap(0), j);
        if (hasSubmitted) {
          emit log_named_string(
            string.concat("prover has submitted proof up till block ", Strings.toString(j)),
            string(abi.encode(provers[i]))
          );
        }
      }
      emit log_named_decimal_uint(
        string.concat("prover ", string(abi.encode(provers[i])), " rewards"),
        rollup.getProverRewardsForProver(Epoch.wrap(0), provers[i]),
        18
      );
    }
  }

  function testMultiProof() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1);
    _proposeBlock("mixed_block_2", 2);

    assertEq(rollup.getProvenBlockNumber(), 0, "Block already proven");

    _proveBlock("mixed_block_1", "mixed_block_1", address(bytes20("lasse")));
    _proveBlock("mixed_block_1", "mixed_block_1", address(bytes20("mitch")));
    _proveBlock("mixed_block_1", "mixed_block_2", address(bytes20("mitch")));

    logStatus();

    assertEq(rollup.getProvenBlockNumber(), 2, "Block not proven");
  }

  function _proveBlock(string memory _startName, string memory _endName, address _prover) internal {
    DecoderBase.Full memory startFull = load(_startName);
    DecoderBase.Full memory endFull = load(_endName);

    uint256 startBlockNumber = uint256(startFull.block.decodedHeader.globalVariables.blockNumber);
    uint256 endBlockNumber = uint256(endFull.block.decodedHeader.globalVariables.blockNumber);

    BlockLog memory parentBlockLog = rollup.getBlock(startBlockNumber - 1);

    // What are these even?
    bytes32[7] memory args = [
      parentBlockLog.archive,
      endFull.block.archive,
      parentBlockLog.blockHash,
      endFull.block.blockHash,
      bytes32(0), // WHAT ?
      bytes32(0), // WHAT ?
      bytes32(bytes20(_prover))
    ];

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

    address sequencer = address(bytes20("sequencer"));

    uint256 size = endBlockNumber - startBlockNumber + 1;
    for (uint256 i = 0; i < size; i++) {
      fees[i * 2] = bytes32(bytes20(sequencer));
      fees[i * 2 + 1] = bytes32(uint256(0e18));
    }
    // WHAT ARE THIS FUCKER ACTUALLY?
    // Need to populate this better because it is totally obscure what it is right now.

    bytes memory blobPublicInputs;

    if (keccak256(abi.encodePacked(_startName)) != keccak256(abi.encodePacked(_endName))) {
      blobPublicInputs = abi.encodePacked(
        this.getBlobPublicInputs(startFull.block.blobInputs),
        this.getBlobPublicInputs(endFull.block.blobInputs)
      );
    } else {
      blobPublicInputs = this.getBlobPublicInputs(endFull.block.blobInputs);
    }

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: startBlockNumber,
        end: endBlockNumber,
        args: args,
        fees: fees,
        blobPublicInputs: blobPublicInputs,
        aggregationObject: "",
        proof: ""
      })
    );
  }

  function _proposeBlock(string memory name, uint256 _slotNumber) public {
    DecoderBase.Full memory full = load(name);
    bytes memory header = full.block.header;
    bytes memory blobInputs = full.block.blobInputs;

    Slot slotNumber = Slot.wrap(_slotNumber);

    // Overwrite some timestamps if needed
    if (slotNumber != Slot.wrap(0)) {
      Timestamp ts = rollup.getTimestampForSlot(slotNumber);

      full.block.decodedHeader.globalVariables.timestamp = Timestamp.unwrap(ts);
      full.block.decodedHeader.globalVariables.slotNumber = Slot.unwrap(slotNumber);
      assembly {
        mstore(add(header, add(0x20, 0x0194)), slotNumber)
        mstore(add(header, add(0x20, 0x01b4)), ts)
        mstore(add(header, add(0x20, 0x0268)), 420)
      }
    }

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, full.block.decodedHeader.globalVariables.timestamp));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);

    {
      bytes32[] memory blobHashes = new bytes32[](1);
      // The below is the blob hash == bytes [1:33] of _blobInput
      bytes32 blobHash;
      assembly {
        blobHash := mload(add(blobInputs, 0x21))
      }
      blobHashes[0] = blobHash;
      vm.blobhashes(blobHashes);
    }
    header = _updateHeaderBaseFee(header);

    ProposeArgs memory args = ProposeArgs({
      header: header,
      archive: full.block.archive,
      blockHash: full.block.blockHash,
      oracleInput: OracleInput(0, 0),
      txHashes: new bytes32[](0)
    });
    rollup.propose(args, signatures, full.block.body, blobInputs);

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

    (bytes32 root,) = outbox.getRootData(full.block.decodedHeader.globalVariables.blockNumber);

    // If we are trying to read a block beyond the proven chain, we should see "nothing".
    if (rollup.getProvenBlockNumber() >= full.block.decodedHeader.globalVariables.blockNumber) {
      assertEq(l2ToL1MessageTreeRoot, root, "Invalid l2 to l1 message tree root");
    } else {
      assertEq(root, bytes32(0), "Invalid outbox root");
    }

    assertEq(rollup.archive(), args.archive, "Invalid archive");
  }

  function _populateInbox(address _sender, bytes32 _recipient, bytes32[] memory _contents) internal {
    for (uint256 i = 0; i < _contents.length; i++) {
      vm.prank(_sender);
      inbox.sendL2Message(
        DataStructures.L2Actor({actor: _recipient, version: 1}), _contents[i], bytes32(0)
      );
    }
  }

  function _submitEpochProofWithFee(
    Rollup _rollup,
    uint256 _start,
    uint256 _end,
    bytes32 _previousArchive,
    bytes32 _endArchive,
    bytes32 _previousBlockHash,
    bytes32 _endBlockHash,
    bytes32 _proverId,
    bytes memory _blobPublicInputs,
    address _feeRecipient,
    uint256 _feeAmount
  ) internal {
    bytes32[7] memory args = [
      _previousArchive,
      _endArchive,
      _previousBlockHash,
      _endBlockHash,
      bytes32(0),
      bytes32(0),
      _proverId
    ];

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

    fees[0] = bytes32(bytes20(_feeRecipient));
    fees[1] = bytes32(_feeAmount);

    _rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: _start,
        end: _end,
        args: args,
        fees: fees,
        blobPublicInputs: _blobPublicInputs,
        aggregationObject: "",
        proof: ""
      })
    );
  }

  function _quoteToSignedQuote(EpochProofQuote memory _quote)
    internal
    view
    returns (SignedEpochProofQuote memory)
  {
    bytes32 digest = rollup.quoteToDigest(_quote);
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
    return SignedEpochProofQuote({
      quote: _quote,
      signature: Signature({isEmpty: false, v: v, r: r, s: s})
    });
  }

  function _updateHeaderBaseFee(bytes memory _header) private view returns (bytes memory) {
    uint256 baseFee = rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true);
    assembly {
      mstore(add(_header, add(0x20, 0x0228)), baseFee)
    }
    return _header;
  }

  function getBlobPublicInputs(bytes calldata _blobsInput)
    public
    pure
    returns (bytes memory blobPublicInputs)
  {
    uint8 numBlobs = uint8(_blobsInput[0]);
    blobPublicInputs = abi.encodePacked(numBlobs, blobPublicInputs);
    for (uint256 i = 0; i < numBlobs; i++) {
      // Add 1 for the numBlobs prefix
      uint256 blobInputStart = i * 192 + 1;
      // We want to extract the bytes we use for public inputs:
      //  * input[32:64]   - z
      //  * input[64:96]   - y
      //  * input[96:144]  - commitment C
      // Out of 192 bytes per blob.
      blobPublicInputs =
        abi.encodePacked(blobPublicInputs, _blobsInput[blobInputStart + 32:blobInputStart + 144]);
    }
  }
}
