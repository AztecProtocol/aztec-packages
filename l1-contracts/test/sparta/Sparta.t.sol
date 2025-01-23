// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../decoders/Base.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Rollup, Config} from "@aztec/core/Rollup.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {MerkleTestUtil} from "../merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {MockFeeJuicePortal} from "@aztec/mock/MockFeeJuicePortal.sol";
import {
  ProposeArgs, OracleInput, ProposeLib
} from "@aztec/core/libraries/RollupLibs/ProposeLib.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {CheatDepositArgs} from "@aztec/core/interfaces/IRollup.sol";

import {Slot, Epoch, SlotLib, EpochLib} from "@aztec/core/libraries/TimeMath.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {Slasher, IPayload} from "@aztec/core/staking/Slasher.sol";
import {ILeonidas} from "@aztec/core/interfaces/ILeonidas.sol";
import {Status, ValidatorInfo} from "@aztec/core/interfaces/IStaking.sol";
// solhint-disable comprehensive-interface

/**
 * We are using the same blocks as from Rollup.t.sol.
 * The tests in this file is testing the sequencer selection
 */
contract SpartaTest is DecoderBase {
  using MessageHashUtils for bytes32;
  using SlotLib for Slot;
  using EpochLib for Epoch;

  struct StructToAvoidDeepStacks {
    uint256 needed;
    address proposer;
    bool shouldRevert;
  }

  SlashFactory internal slashFactory;
  Slasher internal slasher;
  Inbox internal inbox;
  Outbox internal outbox;
  Rollup internal rollup;
  MerkleTestUtil internal merkleTestUtil;
  TestERC20 internal testERC20;
  RewardDistributor internal rewardDistributor;
  Signature internal emptySignature;
  mapping(address attester => uint256 privateKey) internal attesterPrivateKeys;
  mapping(address proposer => uint256 privateKey) internal proposerPrivateKeys;
  mapping(address proposer => address attester) internal proposerToAttester;
  mapping(address => bool) internal _seenValidators;
  mapping(address => bool) internal _seenCommittee;

  /**
   * @notice  Set up the contracts needed for the tests with time aligned to the provided block name
   */
  modifier setup(uint256 _validatorCount) {
    string memory _name = "mixed_block_1";
    {
      Leonidas leonidas = new Leonidas(
        testERC20,
        TestConstants.AZTEC_MINIMUM_STAKE,
        TestConstants.AZTEC_SLASHING_QUORUM,
        TestConstants.AZTEC_SLASHING_ROUND_SIZE,
        TestConstants.AZTEC_SLOT_DURATION,
        TestConstants.AZTEC_EPOCH_DURATION,
        TestConstants.AZTEC_TARGET_COMMITTEE_SIZE
      );

      DecoderBase.Full memory full = load(_name);
      uint256 slotNumber = full.block.decodedHeader.globalVariables.slotNumber;
      uint256 initialTime =
        full.block.decodedHeader.globalVariables.timestamp - slotNumber * leonidas.SLOT_DURATION();
      vm.warp(initialTime);
    }

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](_validatorCount);

    for (uint256 i = 1; i < _validatorCount + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);
      attesterPrivateKeys[attester] = attesterPrivateKey;
      uint256 proposerPrivateKey = uint256(keccak256(abi.encode("proposer", i)));
      address proposer = vm.addr(proposerPrivateKey);
      proposerPrivateKeys[proposer] = proposerPrivateKey;

      proposerToAttester[proposer] = attester;

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        proposer: proposer,
        withdrawer: address(this),
        amount: TestConstants.AZTEC_MINIMUM_STAKE
      });
    }

    testERC20 = new TestERC20("test", "TEST", address(this));
    Registry registry = new Registry(address(this));
    rewardDistributor = new RewardDistributor(testERC20, registry, address(this));
    rollup = new Rollup({
      _fpcJuicePortal: new MockFeeJuicePortal(),
      _rewardDistributor: rewardDistributor,
      _stakingAsset: testERC20,
      _vkTreeRoot: bytes32(0),
      _protocolContractTreeRoot: bytes32(0),
      _ares: address(this),
      _config: Config({
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        targetCommitteeSize: TestConstants.AZTEC_TARGET_COMMITTEE_SIZE,
        aztecEpochProofClaimWindowInL2Slots: TestConstants.AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS,
        minimumStake: TestConstants.AZTEC_MINIMUM_STAKE,
        slashingQuorum: TestConstants.AZTEC_SLASHING_QUORUM,
        slashingRoundSize: TestConstants.AZTEC_SLASHING_ROUND_SIZE
      })
    });
    slasher = rollup.SLASHER();
    slashFactory = new SlashFactory(ILeonidas(address(rollup)));

    testERC20.mint(address(this), TestConstants.AZTEC_MINIMUM_STAKE * _validatorCount);
    testERC20.approve(address(rollup), TestConstants.AZTEC_MINIMUM_STAKE * _validatorCount);
    rollup.cheat__InitialiseValidatorSet(initialValidators);

    inbox = Inbox(address(rollup.INBOX()));
    outbox = Outbox(address(rollup.OUTBOX()));

    merkleTestUtil = new MerkleTestUtil();

    _;
  }

  function testInitialCommitteeMatch() public setup(4) {
    address[] memory attesters = rollup.getAttesters();
    address[] memory committee = rollup.getCurrentEpochCommittee();
    assertEq(rollup.getCurrentEpoch(), 0);
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

  function testProposerForNonSetupEpoch(uint8 _epochsToJump) public setup(4) {
    Epoch pre = rollup.getCurrentEpoch();
    vm.warp(
      block.timestamp + uint256(_epochsToJump) * rollup.EPOCH_DURATION() * rollup.SLOT_DURATION()
    );
    Epoch post = rollup.getCurrentEpoch();
    assertEq(pre + Epoch.wrap(_epochsToJump), post, "Invalid epoch");

    address expectedProposer = rollup.getCurrentProposer();

    // Add a validator which will also setup the epoch
    testERC20.mint(address(this), TestConstants.AZTEC_MINIMUM_STAKE);
    testERC20.approve(address(rollup), TestConstants.AZTEC_MINIMUM_STAKE);
    rollup.deposit(
      address(0xdead), address(0xdead), address(0xdead), TestConstants.AZTEC_MINIMUM_STAKE
    );

    address actualProposer = rollup.getCurrentProposer();
    assertEq(expectedProposer, actualProposer, "Invalid proposer");
  }

  function testValidatorSetLargerThanCommittee(bool _insufficientSigs) public setup(100) {
    assertGt(rollup.getAttesters().length, rollup.TARGET_COMMITTEE_SIZE(), "Not enough validators");
    uint256 committeeSize = rollup.TARGET_COMMITTEE_SIZE() * 2 / 3 + (_insufficientSigs ? 0 : 1);

    _testBlock("mixed_block_1", _insufficientSigs, committeeSize, false);

    assertEq(
      rollup.getEpochCommittee(rollup.getCurrentEpoch()).length,
      rollup.TARGET_COMMITTEE_SIZE(),
      "Invalid committee size"
    );
  }

  function testHappyPath() public setup(4) {
    _testBlock("mixed_block_1", false, 3, false);
    _testBlock("mixed_block_2", false, 3, false);
  }

  function testNukeFromOrbit() public setup(4) {
    // We propose some blocks, and have a bunch of validators attest to them.
    // Then we slash EVERYONE that was in the committees because the epoch never
    // got finalised.
    // This is LIKELY, not the action you really want to take, you want to slash
    // the people actually attesting, etc, but for simplicity we can do this as showcase.
    _testBlock("mixed_block_1", false, 3, false);
    _testBlock("mixed_block_2", false, 3, false);

    address[] memory attesters = rollup.getAttesters();
    uint256[] memory stakes = new uint256[](attesters.length);

    for (uint256 i = 0; i < attesters.length; i++) {
      ValidatorInfo memory info = rollup.getInfo(attesters[i]);
      stakes[i] = info.stake;
      assertTrue(info.status == Status.VALIDATING, "Invalid status");
    }

    // We say, these things are bad, call the baba yaga to take care of them!
    uint256 slashAmount = 10e18;
    IPayload slashPayload = slashFactory.createSlashPayload(rollup.getCurrentEpoch(), slashAmount);
    vm.prank(address(slasher.PROPOSER()));
    slasher.slash(slashPayload);

    // Make sure that the slash was successful,
    // Meaning that validators are now LIVING and have lost the slash amount
    for (uint256 i = 0; i < attesters.length; i++) {
      ValidatorInfo memory info = rollup.getInfo(attesters[i]);
      uint256 stake = info.stake;
      assertEq(stake, stakes[i] - slashAmount, "Invalid stake");
      assertTrue(info.status == Status.LIVING, "Invalid status");
    }
  }

  function testInvalidProposer() public setup(4) {
    _testBlock("mixed_block_1", true, 3, true);
  }

  function testInsufficientSigs() public setup(4) {
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
    vm.warp(max(block.timestamp, full.block.decodedHeader.globalVariables.timestamp));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);

    ree.proposer = rollup.getCurrentProposer();
    ree.shouldRevert = false;

    rollup.setupEpoch();

    bytes32[] memory txHashes = new bytes32[](0);

    // We update the header to have 0 as the base fee
    assembly {
      mstore(add(add(header, 0x20), 0x0228), 0)
    }

    ProposeArgs memory args = ProposeArgs({
      header: header,
      archive: full.block.archive,
      blockHash: bytes32(0),
      oracleInput: OracleInput(0, 0),
      txHashes: txHashes
    });

    if (_signatureCount > 0 && ree.proposer != address(0)) {
      address[] memory validators = rollup.getEpochCommittee(rollup.getCurrentEpoch());
      ree.needed = validators.length * 2 / 3 + 1;

      Signature[] memory signatures = new Signature[](_signatureCount);

      bytes32 digest = ProposeLib.digest(args);
      for (uint256 i = 0; i < _signatureCount; i++) {
        signatures[i] = createSignature(validators[i], digest);
      }

      if (_expectRevert) {
        ree.shouldRevert = true;
        if (_signatureCount < ree.needed) {
          vm.expectRevert(
            abi.encodeWithSelector(
              Errors.Leonidas__InsufficientAttestationsProvided.selector,
              ree.needed,
              _signatureCount
            )
          );
        }
        // @todo Handle SignatureLib__InvalidSignature case
        // @todo Handle Leonidas__InsufficientAttestations case
      }

      skipBlobCheck(address(rollup));
      if (_expectRevert && _invalidProposer) {
        address realProposer = ree.proposer;
        ree.proposer = address(uint160(uint256(keccak256(abi.encode("invalid", ree.proposer)))));
        vm.expectRevert(
          abi.encodeWithSelector(
            Errors.Leonidas__InvalidProposer.selector, realProposer, ree.proposer
          )
        );
        ree.shouldRevert = true;
      }
      vm.prank(ree.proposer);
      rollup.propose(args, signatures, full.block.body, full.block.blobInputs);

      if (ree.shouldRevert) {
        return;
      }
    } else {
      Signature[] memory signatures = new Signature[](0);
      rollup.propose(args, signatures, full.block.body, full.block.blobInputs);
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
      // TODO edit full.messages to include information about msgs per tx?
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

  function createSignature(address _signer, bytes32 _digest)
    internal
    view
    returns (Signature memory)
  {
    uint256 privateKey = attesterPrivateKeys[_signer];

    bytes32 digest = _digest.toEthSignedMessageHash();
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

    return Signature({isEmpty: false, v: v, r: r, s: s});
  }
}
