// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, EpochLib, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IPayload} from "@aztec/core/slashing/Slasher.sol";

import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";

import {HeaderLib} from "@aztec/core/libraries/rollup/HeaderLib.sol";
import {
  ProposeArgs,
  OracleInput,
  ProposeLib,
  ProposePayload
} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {DecoderBase} from "../base/DecoderBase.sol";

import {Timestamp, EpochLib, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IPayload} from "@aztec/core/slashing/Slasher.sol";
import {AttesterView, Status} from "@aztec/core/interfaces/IStaking.sol";

import {ValidatorSelectionTestBase} from "./ValidatorSelectionBase.sol";

import {NaiveMerkle} from "../merkle/Naive.sol";

// solhint-disable comprehensive-interface

/**
 * We are using the same blocks as from Rollup.t.sol.
 * The tests in this file is testing the sequencer selection
 */
contract ValidatorSelectionTest is ValidatorSelectionTestBase {
  using MessageHashUtils for bytes32;
  using EpochLib for Epoch;

  function testInitialCommitteeMatch() public setup(4) progressEpochs(2) {
    address[] memory attesters = rollup.getAttesters();
    address[] memory committee = rollup.getCurrentEpochCommittee();
    assertEq(rollup.getCurrentEpoch(), 2);
    assertEq(attesters.length, 4, "Invalid validator set size");
    assertEq(committee.length, 4, "invalid committee set size");

    for (uint256 i = 0; i < attesters.length; i++) {
      _seenValidators[attesters[i]] = true;
    }

    for (uint256 i = 0; i < committee.length; i++) {
      assertTrue(_seenValidators[committee[i]]);
      assertFalse(_seenCommittee[committee[i]]);
      _seenCommittee[committee[i]] = true;
    }

    // The proposer is not necessarily an attester, we have to map it back. We can do this here
    // because we created a 1:1 link. In practice, there could be multiple attesters for the same proposer
    address proposer = rollup.getCurrentProposer();
    assertTrue(_seenCommittee[proposerToAttester[proposer]]);
  }

  function testProposerForNonSetupEpoch(uint8 _epochsToJump) public setup(4) progressEpochs(2) {
    Epoch pre = rollup.getCurrentEpoch();
    vm.warp(
      block.timestamp
        + uint256(_epochsToJump) * rollup.getEpochDuration() * rollup.getSlotDuration()
    );
    Epoch post = rollup.getCurrentEpoch();
    assertEq(pre + Epoch.wrap(_epochsToJump), post, "Invalid epoch");

    address expectedProposer = rollup.getCurrentProposer();

    // Add a validator which will also setup the epoch
    testERC20.mint(address(this), rollup.getMinimumStake());
    testERC20.approve(address(rollup), rollup.getMinimumStake());
    rollup.deposit(address(0xdead), address(0xdead), address(0xdead), true);

    address actualProposer = rollup.getCurrentProposer();
    assertEq(expectedProposer, actualProposer, "Invalid proposer");
  }

  function testCommitteeForNonSetupEpoch(uint8 _epochsToJump) public setup(4) progressEpochs(2) {
    Epoch pre = rollup.getCurrentEpoch();
    vm.warp(
      block.timestamp
        + uint256(_epochsToJump) * rollup.getEpochDuration() * rollup.getSlotDuration()
    );

    Epoch post = rollup.getCurrentEpoch();

    uint256 validatorSetSize = rollup.getAttesters().length;
    uint256 targetCommitteeSize = rollup.getTargetCommitteeSize();
    uint256 expectedSize =
      validatorSetSize > targetCommitteeSize ? targetCommitteeSize : validatorSetSize;

    address[] memory preCommittee = rollup.getEpochCommittee(pre);
    address[] memory postCommittee = rollup.getEpochCommittee(post);
    assertEq(preCommittee.length, expectedSize, "Invalid committee size");
    assertEq(postCommittee.length, expectedSize, "Invalid committee size");

    // Elements in the committee should be the same
    assertEq(preCommittee, postCommittee, "Committee elements have changed");
  }

  function testStableCommittee(uint8 _timeToJump) public setup(4) progressEpochs(2) {
    Epoch epoch = rollup.getCurrentEpoch();

    uint256 preSize = rollup.getActiveAttesterCount();

    uint32 upper = uint32(
      Timestamp.unwrap(rollup.getGenesisTime())
        + rollup.getEpochDuration() * rollup.getSlotDuration() * (Epoch.unwrap(epoch) + 1) - 1
    );

    uint32 ts = uint32(block.timestamp);
    uint32 ts2 = uint32(bound(_timeToJump, ts + 1, upper));

    vm.warp(ts2);

    // add a new validator
    testERC20.mint(address(this), rollup.getMinimumStake());
    testERC20.approve(address(rollup), rollup.getMinimumStake());
    rollup.deposit(address(0xdead), address(0xdead), address(0xdead), true);

    assertEq(rollup.getCurrentEpoch(), epoch);
    address[] memory committee = rollup.getCurrentEpochCommittee();
    assertEq(committee.length, preSize, "Invalid committee size");
    assertEq(rollup.getActiveAttesterCount(), preSize + 1);
    for (uint256 i = 0; i < committee.length; i++) {
      assertNotEq(committee[i], address(0xdead));
    }
  }

  function testValidatorSetLargerThanCommittee(bool _insufficientSigs)
    public
    setup(100)
    progressEpochs(2)
  {
    assertGt(rollup.getAttesters().length, rollup.getTargetCommitteeSize(), "Not enough validators");
    uint256 committeeSize = rollup.getTargetCommitteeSize() * 2 / 3 + (_insufficientSigs ? 0 : 1);

    _testBlock("mixed_block_1", _insufficientSigs, committeeSize, false);

    assertEq(
      rollup.getEpochCommittee(rollup.getCurrentEpoch()).length,
      rollup.getTargetCommitteeSize(),
      "Invalid committee size"
    );
  }

  function testHappyPath() public setup(4) progressEpochs(2) {
    _testBlock("mixed_block_1", false, 3, false);
    _testBlock("mixed_block_2", false, 3, false);
  }

  function testNukeFromOrbit() public setup(4) progressEpochs(2) {
    // We propose some blocks, and have a bunch of validators attest to them.
    // Then we slash EVERYONE that was in the committees because the epoch never
    // got finalised.
    // This is LIKELY, not the action you really want to take, you want to slash
    // the people actually attesting, etc, but for simplicity we can do this as showcase.
    _testBlock("mixed_block_1", false, 3, false);
    _testBlock("mixed_block_2", false, 3, false);

    address[] memory attesters = rollup.getAttesters();
    uint256[] memory stakes = new uint256[](attesters.length);
    uint256[] memory offenses = new uint256[](attesters.length);
    uint96[] memory amounts = new uint96[](attesters.length);

    // We say, these things are bad, call the baba yaga to take care of them!
    uint96 slashAmount = 10e18;
    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      stakes[i] = attesterView.effectiveBalance;
      amounts[i] = slashAmount;
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }

    IPayload slashPayload = slashFactory.createSlashPayload(attesters, amounts, offenses);
    vm.prank(address(slasher.PROPOSER()));
    slasher.slash(slashPayload);

    // Make sure that the slash was successful,
    // Meaning that validators are now LIVING and have lost the slash amount
    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      assertEq(attesterView.effectiveBalance, 0);
      assertEq(attesterView.exit.amount, stakes[i] - slashAmount, "Invalid stake");
      assertTrue(attesterView.status == Status.LIVING, "Invalid status after");
    }
  }

  function testInvalidProposer() public setup(4) progressEpochs(2) {
    _testBlock("mixed_block_1", true, 3, true);
  }

  function testInsufficientSigs() public setup(4) progressEpochs(2) {
    _testBlock("mixed_block_1", true, 2, false);
  }

  function _testBlock(
    string memory _name,
    bool _expectRevert,
    uint256 _signatureCount,
    bool _invalidProposer
  ) internal {
    DecoderBase.Full memory full = load(_name);
    bytes memory header = full.block.header;

    StructToAvoidDeepStacks memory ree;

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, full.block.decodedHeader.timestamp));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);

    rollup.setupEpoch();

    ree.proposer = rollup.getCurrentProposer();
    ree.shouldRevert = false;

    bytes32[] memory txHashes = new bytes32[](0);

    {
      uint256 manaBaseFee = rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true);
      bytes32 inHash = inbox.getRoot(full.block.blockNumber);
      header = DecoderBase.updateHeaderInboxRoot(header, inHash);
      header = DecoderBase.updateHeaderBaseFee(header, manaBaseFee);
    }

    ProposeArgs memory args = ProposeArgs({
      header: header,
      archive: full.block.archive,
      stateReference: new bytes(0),
      oracleInput: OracleInput(0),
      txHashes: txHashes
    });

    if (_signatureCount > 0 && ree.proposer != address(0)) {
      address[] memory validators = rollup.getEpochCommittee(rollup.getCurrentEpoch());
      ree.needed = validators.length * 2 / 3 + 1;

      Signature[] memory signatures = new Signature[](_signatureCount);

      ProposePayload memory proposePayload = ProposePayload({
        archive: args.archive,
        stateReference: args.stateReference,
        oracleInput: args.oracleInput,
        headerHash: HeaderLib.hash(header),
        txHashes: args.txHashes
      });

      bytes32 digest = ProposeLib.digest(proposePayload);
      for (uint256 i = 0; i < _signatureCount; i++) {
        signatures[i] = createSignature(validators[i], digest);
      }

      if (_expectRevert) {
        ree.shouldRevert = true;
        if (_signatureCount < ree.needed) {
          vm.expectRevert(
            abi.encodeWithSelector(
              Errors.ValidatorSelection__InsufficientAttestationsProvided.selector,
              ree.needed,
              _signatureCount
            )
          );
        }
        // @todo Handle SignatureLib__InvalidSignature case
        // @todo Handle ValidatorSelection__InsufficientAttestations case
      }

      skipBlobCheck(address(rollup));
      if (_expectRevert && _invalidProposer) {
        address realProposer = ree.proposer;
        ree.proposer = address(uint160(uint256(keccak256(abi.encode("invalid", ree.proposer)))));
        vm.expectRevert(
          abi.encodeWithSelector(
            Errors.ValidatorSelection__InvalidProposer.selector, realProposer, ree.proposer
          )
        );
        ree.shouldRevert = true;
      }

      emit log("Time to propose");
      vm.prank(ree.proposer);
      rollup.propose(args, signatures, full.block.blobInputs);

      if (ree.shouldRevert) {
        return;
      }
    } else {
      Signature[] memory signatures = new Signature[](0);
      rollup.propose(args, signatures, full.block.blobInputs);
    }

    assertEq(_expectRevert, ree.shouldRevert, "Does not match revert expectation");

    bytes32 l2ToL1MessageTreeRoot;
    {
      uint32 numTxs = full.block.numTxs;
      // NB: The below works with full blocks because we require the largest possible subtrees
      // for L2 to L1 messages - usually we make variable height subtrees, the roots of which
      // form a balanced tree

      // The below is a little janky - we know that this test deals with full txs with equal numbers
      // of msgs or txs with no messages, so the division works
      // TODO edit full.messages to include attesterViewrmation about msgs per tx?
      uint256 subTreeHeight = merkleTestUtil.calculateTreeHeightFromSize(
        full.messages.l2ToL1Messages.length == 0 ? 0 : full.messages.l2ToL1Messages.length / numTxs
      );
      uint256 outHashTreeHeight = merkleTestUtil.calculateTreeHeightFromSize(numTxs);
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

    (bytes32 root,) = outbox.getRootData(full.block.blockNumber);

    // If we are trying to read a block beyond the proven chain, we should see "nothing".
    if (rollup.getProvenBlockNumber() >= full.block.blockNumber) {
      assertEq(l2ToL1MessageTreeRoot, root, "Invalid l2 to l1 message tree root");
    } else {
      assertEq(root, bytes32(0), "Invalid outbox root");
    }

    assertEq(rollup.archive(), args.archive, "Invalid archive");
  }

  function _populateInbox(address _sender, bytes32 _recipient, bytes32[] memory _contents) internal {
    uint256 version = rollup.getVersion();
    for (uint256 i = 0; i < _contents.length; i++) {
      vm.prank(_sender);
      inbox.sendL2Message(
        DataStructures.L2Actor({actor: _recipient, version: version}), _contents[i], bytes32(0)
      );
    }
  }
}
