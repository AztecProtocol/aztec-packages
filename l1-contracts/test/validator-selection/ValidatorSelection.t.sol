// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Strings} from "@oz/utils/Strings.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {
  Signature,
  CommitteeAttestation,
  CommitteeAttestations,
  AttestationLib
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IPayload} from "@aztec/core/slashing/Slasher.sol";

import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {ProposedHeaderLib} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {ProposeArgs, OracleInput, ProposeLib, ProposePayload} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {DecoderBase} from "../base/DecoderBase.sol";

import {AttesterView, Status} from "@aztec/core/interfaces/IStaking.sol";
import {IPayload} from "@aztec/core/slashing/Slasher.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";

import {GSE} from "@aztec/governance/GSE.sol";
import {ValidatorSelectionTestBase} from "./ValidatorSelectionBase.sol";

import {NaiveMerkle} from "../merkle/Naive.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";

import {
  BlockLog,
  PublicInputArgs,
  SubmitEpochRootProofArgs,
  BlockHeaderValidationFlags
} from "@aztec/core/interfaces/IRollup.sol";

import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";

// solhint-disable comprehensive-interface

// Test Block Flags
struct TestFlags {
  bool senderIsNotProposer;
  bool proposerAttestationNotProvided;
  bool invalidAttestationSigner;
  bool invalidSigners;
  bool invalidAddressAttestation;
  bool invalidSignatureSValue;
  bool invalidSignatureAddress0;
  bool invalidAttestationAndSignersSignature;
}

library TestFlagsLib {
  function empty() internal pure returns (TestFlags memory) {
    return TestFlags({
      senderIsNotProposer: false,
      proposerAttestationNotProvided: false,
      invalidAttestationSigner: false,
      invalidSigners: false,
      invalidAddressAttestation: false,
      invalidSignatureSValue: false,
      invalidSignatureAddress0: false,
      invalidAttestationAndSignersSignature: false
    });
  }

  function invalidateProposer(TestFlags memory _flags) internal pure returns (TestFlags memory) {
    _flags.senderIsNotProposer = true;
    return _flags;
  }

  function withoutProposerAttestation(TestFlags memory _flags) internal pure returns (TestFlags memory) {
    _flags.proposerAttestationNotProvided = true;
    return _flags;
  }

  function invalidateAttestationSigner(TestFlags memory _flags) internal pure returns (TestFlags memory) {
    _flags.invalidAttestationSigner = true;
    return _flags;
  }

  function invalidateSigners(TestFlags memory _flags) internal pure returns (TestFlags memory) {
    _flags.invalidSigners = true;
    return _flags;
  }

  function invalidateAddressAttestation(TestFlags memory _flags) internal pure returns (TestFlags memory) {
    _flags.invalidAddressAttestation = true;
    return _flags;
  }

  function invalidateSignatureSValue(TestFlags memory _flags) internal pure returns (TestFlags memory) {
    _flags.invalidSignatureSValue = true;
    return _flags;
  }

  function invalidateSignatureAddress0(TestFlags memory _flags) internal pure returns (TestFlags memory) {
    _flags.invalidSignatureAddress0 = true;
    return _flags;
  }

  function invalidateAttestationAndSignersSignature(TestFlags memory _flags) internal pure returns (TestFlags memory) {
    _flags.invalidAttestationAndSignersSignature = true;
    return _flags;
  }
}

/**
 * We are using the same blocks as from Rollup.t.sol.
 * The tests in this file is testing the sequencer selection
 */
contract ValidatorSelectionTest is ValidatorSelectionTestBase {
  using MessageHashUtils for bytes32;
  using TestFlagsLib for TestFlags;

  bytes4 NO_REVERT = bytes4(0);
  bytes4 ANY_REVERT = bytes4(0xFFFFFFFF);

  function getAttesters() internal view returns (address[] memory) {
    GSE gse = rollup.getGSE();
    uint256 count = rollup.getActiveAttesterCount();
    address[] memory attesters = new address[](count);
    for (uint256 i = 0; i < count; i++) {
      attesters[i] = gse.getAttesterFromIndexAtTime(address(rollup), i, Timestamp.wrap(block.timestamp));
    }

    return attesters;
  }

  function testInitialCommitteeMatch() public setup(4, 4) progressEpochs(2) {
    address[] memory attesters = getAttesters();
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
    assertTrue(_seenCommittee[proposer]);
  }

  function testProposerForNonSetupEpoch(uint8 _epochsToJump) public setup(4, 4) progressEpochs(2) {
    Epoch pre = rollup.getCurrentEpoch();
    vm.warp(block.timestamp + uint256(_epochsToJump) * rollup.getEpochDuration() * rollup.getSlotDuration());
    Epoch post = rollup.getCurrentEpoch();
    assertEq(pre + Epoch.wrap(_epochsToJump), post, "Invalid epoch");

    address expectedProposer = rollup.getCurrentProposer();

    // Add a validator which will also setup the epoch
    uint256 activationThreshold = rollup.getActivationThreshold();
    vm.prank(testERC20.owner());
    testERC20.mint(address(this), activationThreshold);
    testERC20.approve(address(rollup), activationThreshold);
    rollup.deposit(address(0xdead), address(0xdead), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), true);

    address actualProposer = rollup.getCurrentProposer();
    assertEq(expectedProposer, actualProposer, "Invalid proposer");
  }

  function testCommitteeForNonSetupEpoch() public setup(8, 4) progressEpochs(2) {
    Epoch pre = rollup.getCurrentEpoch();
    // Jump 8 epochs into the future to ensure that it haven't been setup.
    vm.warp(block.timestamp + 8 * rollup.getEpochDuration() * rollup.getSlotDuration());

    Epoch post = rollup.getCurrentEpoch();

    uint256 validatorSetSize = rollup.getActiveAttesterCount();
    uint256 targetCommitteeSize = rollup.getTargetCommitteeSize();
    uint256 expectedSize = validatorSetSize > targetCommitteeSize ? targetCommitteeSize : validatorSetSize;

    address[] memory preCommittee = rollup.getEpochCommittee(pre);
    address[] memory postCommittee = rollup.getEpochCommittee(post);
    assertEq(preCommittee.length, expectedSize, "Invalid committee size");
    assertEq(postCommittee.length, expectedSize, "Invalid committee size");

    // Elements in the committee should **not** be the same, as the epoch is mixed into the seed
    assertNotEq(preCommittee, postCommittee, "Committee elements have not changed");
  }

  function testStableCommittee(uint8 _timeToJump) public setup(4, 4) progressEpochs(2) {
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
    uint256 activationThreshold = rollup.getActivationThreshold();
    vm.prank(testERC20.owner());
    testERC20.mint(address(this), activationThreshold);
    testERC20.approve(address(rollup), activationThreshold);
    rollup.deposit(address(0xdead), address(0xdead), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), true);
    rollup.flushEntryQueue();

    assertEq(rollup.getCurrentEpoch(), epoch);
    address[] memory committee = rollup.getCurrentEpochCommittee();
    assertEq(committee.length, preSize, "Invalid committee size");
    assertEq(rollup.getActiveAttesterCount(), preSize + 1);
    for (uint256 i = 0; i < committee.length; i++) {
      assertNotEq(committee[i], address(0xdead));
    }
  }

  // NOTE: this must be run with --isolate as transient storage gets thrashed when working out the proposer.
  // This also changes the committee which is calculated within each call.
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/14275): clear out transient storage used by the sample
  // lib - we cannot afford to have a malicious proposer
  // change the committee committment to something unpredictable.

  /// forge-config: default.isolate = true
  function testValidatorSetLargerThanCommittee(bool _insufficientSigs) public setup(100, 48) progressEpochs(2) {
    uint256 committeeSize = rollup.getTargetCommitteeSize();
    uint256 signatureCount = committeeSize * 2 / 3 + (_insufficientSigs ? 0 : 1);
    assertGt(rollup.getActiveAttesterCount(), committeeSize, "Not enough validators");

    ProposeTestData memory ree =
      _testBlock("mixed_block_1", NO_REVERT, signatureCount, committeeSize, TestFlagsLib.empty());

    assertEq(ree.committee.length, rollup.getTargetCommitteeSize(), "Invalid committee size");

    // Test we can invalidate the block by insufficient attestations if sigs were insufficient
    _invalidateByAttestationCount(
      ree, _insufficientSigs ? NO_REVERT : Errors.ValidatorSelection__InsufficientAttestations.selector
    );
  }

  function testHappyPath() public setup(4, 4) progressEpochs(2) {
    _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty());
    _testBlock("mixed_block_2", NO_REVERT, 3, 4, TestFlagsLib.empty());
  }

  function testProveWithAttestations() public setup(4, 4) progressEpochs(2) {
    _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty());
    ProposeTestData memory ree2 = _testBlock("mixed_block_2", NO_REVERT, 3, 4, TestFlagsLib.empty());
    uint256 blockNumber = rollup.getPendingBlockNumber();

    _proveBlocks(
      "mixed_block_", blockNumber - 1, blockNumber, AttestationLibHelper.packAttestations(ree2.attestations), NO_REVERT
    );
  }

  function testProveFailWithoutCorrectAttestations() public setup(4, 4) progressEpochs(2) {
    ProposeTestData memory ree1 = _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty());
    _testBlock("mixed_block_2", NO_REVERT, 3, 4, TestFlagsLib.empty());
    uint256 blockNumber = rollup.getPendingBlockNumber();

    _proveBlocks(
      "mixed_block_",
      blockNumber - 1,
      blockNumber,
      AttestationLibHelper.packAttestations(ree1.attestations),
      Errors.Rollup__InvalidAttestations.selector
    );
  }

  function testCannotInvalidateProperProposal() public setup(4, 4) progressEpochs(2) {
    ProposeTestData memory ree = _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty());
    _invalidateByAttestationCount(ree, Errors.ValidatorSelection__InsufficientAttestations.selector);

    for (uint256 i = 0; i < ree.attestations.length; i++) {
      _invalidateByAttestationSig(ree, i, Errors.Rollup__AttestationsAreValid.selector);
    }
  }

  function testNukeFromOrbit() public setup(4, 4) progressEpochs(2) {
    // We propose some blocks, and have a bunch of validators attest to them.
    // Then we slash EVERYONE that was in the committees because the epoch never
    // got finalized.
    // This is LIKELY, not the action you really want to take, you want to slash
    // the people actually attesting, etc, but for simplicity we can do this as showcase.
    _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty());
    _testBlock("mixed_block_2", NO_REVERT, 3, 4, TestFlagsLib.empty());

    address[] memory attesters = getAttesters();
    uint256[] memory stakes = new uint256[](attesters.length);
    uint128[][] memory offenses = new uint128[][](attesters.length);
    uint96[] memory amounts = new uint96[](attesters.length);

    // We say, these things are bad, call the baba yaga to take care of them!
    uint96 slashAmount = 90e18;
    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      stakes[i] = attesterView.effectiveBalance;
      amounts[i] = slashAmount;
      offenses[i] = new uint128[](0); // Empty array of offenses for each validator
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }

    IPayload slashPayload = slashFactory.createSlashPayload(attesters, amounts, offenses);
    vm.prank(address(slasher.PROPOSER()));
    slasher.slash(slashPayload);

    // Make sure that the slash was successful,
    // Meaning that validators are now ZOMBIE and have lost the slash amount
    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      assertEq(attesterView.effectiveBalance, 0);
      assertEq(attesterView.exit.amount, stakes[i] - slashAmount, "Invalid stake");
      assertTrue(attesterView.status == Status.ZOMBIE, "Invalid status after");
    }
  }

  function testProposerAttested() public setup(4, 4) progressEpochs(2) {
    // Having someone that is not the proposer submit it, but with all signatures (so there is signature from proposer)
    _testBlock("mixed_block_1", NO_REVERT, 4, 4, TestFlagsLib.empty().invalidateProposer());
  }

  function testProposerAttestationNotProvided() public setup(4, 4) progressEpochs(2) {
    _testBlock(
      "mixed_block_1",
      Errors.ValidatorSelection__MissingProposerSignature.selector,
      3,
      4,
      TestFlagsLib.empty().withoutProposerAttestation()
    );
  }

  function testInvalidSigners() public setup(4, 4) progressEpochs(2) {
    _testBlock(
      "mixed_block_1",
      Errors.ValidatorSelection__InvalidCommitteeCommitment.selector,
      3,
      4,
      TestFlagsLib.empty().invalidateSigners()
    );
  }

  function testInvalidAttestationAndSignersSignature() public setup(4, 4) progressEpochs(2) {
    _testBlock(
      "mixed_block_1",
      Errors.SignatureLib__InvalidSignature.selector,
      3,
      4,
      TestFlagsLib.empty().invalidateAttestationAndSignersSignature()
    );
  }

  function testInvalidAttestationIndex(uint256 _invalidIndex) public setup(4, 4) progressEpochs(2) {
    ProposeTestData memory ree = _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty());
    uint256 invalidIndex = bound(_invalidIndex, ree.committee.length, type(uint256).max);
    _invalidateByAttestationSig(ree, invalidIndex, Errors.Rollup__InvalidAttestationIndex.selector);
  }

  function testInvalidAttestationSigner() public setup(4, 4) progressEpochs(2) {
    ProposeTestData memory ree =
      _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty().invalidateAttestationSigner());

    // the invalid attestation is the first one
    _invalidateByAttestationSig(ree, 1, Errors.Rollup__AttestationsAreValid.selector);
    _invalidateByAttestationSig(ree, 0, NO_REVERT);
  }

  function testInvalidAddressAttestation() public setup(4, 4) progressEpochs(2) {
    _testBlock(
      "mixed_block_1",
      Errors.ValidatorSelection__InvalidCommitteeCommitment.selector,
      3,
      4,
      TestFlagsLib.empty().invalidateAddressAttestation()
    );
  }

  function testInvalidSignatureSValue() public setup(4, 4) progressEpochs(2) {
    // Update one of the signatures such that the S value will make the signature validation fail

    ProposeTestData memory ree =
      _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty().invalidateSignatureSValue());

    // Now we need to invalidate the invalid signature
    _invalidateByAttestationSig(ree, ree.invalidSignatureIndex, NO_REVERT);

    // The proof should fail because we just invalidated!
    _proveBlocks(
      "mixed_block_",
      1,
      1,
      AttestationLibHelper.packAttestations(ree.attestations),
      Errors.Rollup__InvalidBlockNumber.selector
    );
  }

  function testInvalidSignatureAddress0() public setup(4, 4) progressEpochs(2) {
    // Update one of the signatures such that the recovered address will be 0 and signature validations fails

    ProposeTestData memory ree =
      _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty().invalidateSignatureAddress0());

    // Now we need to invalidate the invalid signature
    _invalidateByAttestationSig(ree, ree.invalidSignatureIndex, NO_REVERT);

    // The proof should fail because we just invalidated!
    _proveBlocks(
      "mixed_block_",
      1,
      1,
      AttestationLibHelper.packAttestations(ree.attestations),
      Errors.Rollup__InvalidBlockNumber.selector
    );
  }

  function testInsufficientSignatures() public setup(4, 4) progressEpochs(2) {
    ProposeTestData memory ree = _testBlock("mixed_block_1", NO_REVERT, 2, 4, TestFlagsLib.empty());

    _invalidateByAttestationCount(ree, NO_REVERT);
  }

  function testInvalidateMultipleBlocks() public setup(4, 4) progressEpochs(2) {
    uint256 initialBlockNumber = rollup.getPendingBlockNumber();
    ProposeTestData memory ree =
      _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty().invalidateAttestationSigner());
    _testBlock("mixed_block_2", NO_REVERT, 3, 4, TestFlagsLib.empty());

    _invalidateByAttestationSig(ree, 0, NO_REVERT, initialBlockNumber + 1);
  }

  function testProposeBlockAfterInvalidate() public setup(4, 4) progressEpochs(2) {
    uint256 initialBlockNumber = rollup.getPendingBlockNumber();
    ProposeTestData memory ree =
      _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty().invalidateAttestationSigner());
    _invalidateByAttestationSig(ree, 0, NO_REVERT);

    _testBlock("mixed_block_1", NO_REVERT, 3, 4, TestFlagsLib.empty());
    assertEq(rollup.getPendingBlockNumber(), initialBlockNumber + 1, "Failed to propose block after invalidate");
  }

  function testCannotProposeIfAllValidatorsHaveMoved() public setup(4, 4) progressEpochs(2) {
    // Buried in the RollupBuilder, we add initial validators using l1-contracts/src/mock/MultiAdder.sol
    // In that, you see this inconspicuous true at the end of the call to deposit. This means that the
    // validators are going into the "bonus" instance, are are thus not tied directly to the rollup from
    // the perspective of the GSE.
    // The "bonus" instance (which is tracked by the GSE) is only available to the latest rollup in the GSE.
    // So when we add a new 0xdead rollup, all the validators we added get moved over to that one,
    // and our original rollup has no validators.
    // So this is showing that in that case, even if all your validators move over, you still cannot build
    // a block if you submit one with no signatures. This was a change from prior behavior where we had had
    // that if there were zero validators in a rollup, anyone could build a block

    GSE gse = rollup.getGSE();
    address caller = gse.owner();
    vm.prank(caller);
    gse.addRollup(address(0xdead));
    assertEq(rollup.getCurrentEpochCommittee().length, 4);
    _testBlock("mixed_block_1", ANY_REVERT, 0, 0, TestFlagsLib.empty());
  }

  function _invalidateByAttestationCount(ProposeTestData memory ree, bytes4 _revertData) internal {
    uint256 blockNumber = rollup.getPendingBlockNumber();
    CommitteeAttestations memory attestations = AttestationLibHelper.packAttestations(ree.attestations);
    if (_revertData != NO_REVERT) {
      vm.expectPartialRevert(_revertData);
    }
    rollup.invalidateInsufficientAttestations(blockNumber, attestations, ree.committee);
    assertEq(
      rollup.getPendingBlockNumber(),
      _revertData == NO_REVERT ? blockNumber - 1 : blockNumber,
      "Block was not invalidated"
    );
  }

  function _invalidateByAttestationSig(ProposeTestData memory ree, uint256 _index, bytes4 _revertData) internal {
    _invalidateByAttestationSig(ree, _index, _revertData, rollup.getPendingBlockNumber());
  }

  function _invalidateByAttestationSig(
    ProposeTestData memory ree,
    uint256 _index,
    bytes4 _revertData,
    uint256 _blockToInvalidate
  ) internal {
    uint256 blockNumber = rollup.getPendingBlockNumber();
    CommitteeAttestations memory attestations = AttestationLibHelper.packAttestations(ree.attestations);
    if (_revertData != NO_REVERT) {
      vm.expectPartialRevert(_revertData);
    }
    rollup.invalidateBadAttestation(_blockToInvalidate, attestations, ree.committee, _index);
    assertEq(
      rollup.getPendingBlockNumber(),
      _revertData == NO_REVERT ? _blockToInvalidate - 1 : blockNumber,
      "Block was not invalidated"
    );
  }

  function _testBlock(
    string memory _name,
    bytes4 _revertData,
    uint256 _signatureCount,
    uint256 _attestationCount,
    TestFlags memory _flags
  ) internal returns (ProposeTestData memory ree) {
    DecoderBase.Full memory full = load(_name);
    ProposedHeader memory header = full.block.header;

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, Timestamp.unwrap(full.block.header.timestamp)));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);

    rollup.setupEpoch();

    ree.proposer = rollup.getCurrentProposer();
    ree.committee = rollup.getEpochCommittee(rollup.getCurrentEpoch());
    ree.sender = ree.proposer;

    {
      uint128 manaBaseFee = SafeCast.toUint128(rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true));
      bytes32 inHash = inbox.getRoot(full.block.blockNumber);
      header.contentCommitment.inHash = inHash;
      header.gasFees.feePerL2Gas = manaBaseFee;
    }

    ree.proposeArgs = ProposeArgs({
      header: header,
      archive: full.block.archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0)
    });

    skipBlobCheck(address(rollup));

    {
      ree.needed = ree.committee.length * 2 / 3 + 1;
      ree.attestationsCount = _attestationCount;
      ree.proposePayload = ProposePayload({
        archive: ree.proposeArgs.archive,
        stateReference: ree.proposeArgs.stateReference,
        oracleInput: ree.proposeArgs.oracleInput,
        headerHash: ProposedHeaderLib.hash(header)
      });
    }

    ree.attestations = new CommitteeAttestation[](ree.attestationsCount);
    ree.signers = new address[](_signatureCount);
    bytes32 digest = ProposeLib.digest(ree.proposePayload);

    {
      uint256 signersIndex = 0;
      uint256 signaturesCollected = _flags.proposerAttestationNotProvided ? 0 : 1;
      for (uint256 i = 0; i < ree.attestationsCount; i++) {
        if ((ree.committee[i] == ree.proposer && _flags.proposerAttestationNotProvided)) {
          // If the proposer is not providing an attestation, we skip it
          ree.attestations[i] = _createEmptyAttestation(ree.committee[i]);
        } else if ((ree.committee[i] == ree.proposer)) {
          // If the proposer is providing an attestation, set it
          ree.attestations[i] = _createAttestation(ree.committee[i], digest);
          ree.signers[signersIndex] = ree.committee[i];
          signersIndex++;
        } else if ((signaturesCollected >= _signatureCount)) {
          // No need to create more signatures if we have collected enough
          ree.attestations[i] = _createEmptyAttestation(ree.committee[i]);
        } else {
          // Create an attestation for the committee member and add them to the signers
          ree.attestations[i] = _createAttestation(ree.committee[i], digest);
          ree.signers[signersIndex] = ree.committee[i];
          signaturesCollected++;
          signersIndex++;
        }
      }
    }

    if (_flags.senderIsNotProposer) {
      ree.sender = address(uint160(uint256(keccak256(abi.encode("invalid", ree.proposer)))));
    }

    if (_flags.invalidAttestationSigner) {
      // Change the fist element in the committee to a random address
      uint256 invalidAttesterKey = uint256(keccak256(abi.encode("invalid", block.timestamp)));
      address invalidAttester = vm.addr(invalidAttesterKey);
      attesterPrivateKeys[invalidAttester] = invalidAttesterKey;
      ree.attestations[0] = _createAttestation(invalidAttester, digest);
    }

    if (_flags.invalidAddressAttestation) {
      if (ree.proposer != address(0)) {
        ree.attestationsAndSignersSignature = _createAttestation(
          ree.proposer,
          AttestationLib.getAttestationsAndSignersDigest(
            AttestationLibHelper.packAttestations(ree.attestations), ree.signers
          )
        ).signature;
      }
      // Change the last element in the committee (since it don't need a sig as we have enough earlier)
      // to be a random address instead of the expected one.
      address invalidAddress = address(uint160(uint256(keccak256(abi.encode("invalid", block.timestamp)))));
      // We need to find an attestation that is empty, and replace it
      for (uint256 i = 0; i < ree.attestationsCount; i++) {
        if (ree.attestations[i].signature.r == 0) {
          ree.attestations[i] = _createEmptyAttestation(invalidAddress);
          ree.invalidAddressAttestationIndex = i;
          break;
        }
      }
    }

    if (_flags.invalidSignatureSValue) {
      // Need to find a member that have a signature. And update it to have a WAY too big S value.
      for (uint256 i = 0; i < ree.attestationsCount; i++) {
        if (ree.attestations[i].signature.r != 0 && ree.committee[i] != ree.proposer) {
          ree.attestations[i].signature.s = bytes32(type(uint256).max);
          ree.invalidSignatureIndex = i;
          break;
        }
      }
    }

    if (_flags.invalidSignatureAddress0) {
      // Need to find a member that have a signature. And update it such that the signature would recover to 0
      for (uint256 i = 0; i < ree.attestationsCount; i++) {
        if (ree.attestations[i].signature.r != 0 && ree.committee[i] != ree.proposer) {
          // digest
          Signature memory signature = ree.attestations[i].signature;

          (address recovered,,) = ECDSA.tryRecover(digest, signature.v, signature.r, signature.s);

          // Mess up the signature until we find one that is invalid
          while (recovered != address(0)) {
            signature.v = signature.v + 1;
            (recovered,,) = ECDSA.tryRecover(digest, signature.v, signature.r, signature.s);
          }

          ree.attestations[i].signature.v = signature.v;
          ree.invalidSignatureIndex = i;
          break;
        }
      }
    }

    if (_flags.invalidSigners) {
      // Change the first element in the signers to a random address
      uint256 invalidSignerKey = uint256(keccak256(abi.encode("invalid", block.timestamp)));
      address invalidSigner = vm.addr(invalidSignerKey);
      ree.signers[0] = invalidSigner;
    }

    // The proposer signs over the `attestations` and `signers`. Will always be done.
    if (ree.proposer != address(0) && !_flags.invalidAttestationAndSignersSignature) {
      ree.attestationsAndSignersSignature = _createAttestation(
        ree.proposer,
        AttestationLib.getAttestationsAndSignersDigest(
          AttestationLibHelper.packAttestations(ree.attestations), ree.signers
        )
      ).signature;
    } else if (ree.proposer != address(0) && _flags.invalidAttestationAndSignersSignature) {
      // Use a signature that is not the proposers!
      address invalidSigner;
      for (uint256 i = 0; i < ree.signers.length; i++) {
        if (ree.signers[i] != ree.proposer) {
          invalidSigner = ree.signers[i];
          break;
        }
      }
      ree.attestationsAndSignersSignature = _createAttestation(
        invalidSigner,
        AttestationLib.getAttestationsAndSignersDigest(
          AttestationLibHelper.packAttestations(ree.attestations), ree.signers
        )
      ).signature;
    }

    emit log("Time to propose");
    if (_revertData != NO_REVERT) {
      if (_revertData == ANY_REVERT) {
        vm.expectRevert();
      } else {
        vm.expectPartialRevert(_revertData);
      }
    }

    vm.prank(ree.sender);
    rollup.propose(
      ree.proposeArgs,
      AttestationLibHelper.packAttestations(ree.attestations),
      ree.signers,
      ree.attestationsAndSignersSignature,
      full.block.blobCommitments
    );

    if (_revertData != NO_REVERT) {
      return ree;
    }

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

    bytes32 root = outbox.getRootData(full.block.blockNumber);

    // If we are trying to read a block beyond the proven chain, we should see "nothing".
    if (rollup.getProvenBlockNumber() >= full.block.blockNumber) {
      assertEq(l2ToL1MessageTreeRoot, root, "Invalid l2 to l1 message tree root");
    } else {
      assertEq(root, bytes32(0), "Invalid outbox root");
    }

    assertEq(rollup.archive(), ree.proposeArgs.archive, "Invalid archive");
  }

  function _populateInbox(address _sender, bytes32 _recipient, bytes32[] memory _contents) internal {
    uint256 version = rollup.getVersion();
    for (uint256 i = 0; i < _contents.length; i++) {
      vm.prank(_sender);
      inbox.sendL2Message(DataStructures.L2Actor({actor: _recipient, version: version}), _contents[i], bytes32(0));
    }
  }

  function _proveBlocks(
    string memory _name,
    uint256 _start,
    uint256 _end,
    CommitteeAttestations memory _attestations,
    bytes4 _revertData
  ) internal {
    // Logic is mostly duplicated from RollupBase._proveBlocks
    DecoderBase.Full memory startFull = load(string.concat(_name, Strings.toString(_start)));
    DecoderBase.Full memory endFull = load(string.concat(_name, Strings.toString(_end)));

    uint256 startBlockNumber = uint256(startFull.block.blockNumber);
    uint256 endBlockNumber = uint256(endFull.block.blockNumber);

    assertEq(startBlockNumber, _start, "Invalid start block number");
    assertEq(endBlockNumber, _end, "Invalid end block number");

    BlockLog memory parentBlockLog = rollup.getBlock(startBlockNumber - 1);
    address prover = address(0xcafe);

    PublicInputArgs memory args =
      PublicInputArgs({previousArchive: parentBlockLog.archive, endArchive: endFull.block.archive, proverId: prover});

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

    if (_revertData != NO_REVERT) {
      vm.expectPartialRevert(_revertData);
    }

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: startBlockNumber,
        end: endBlockNumber,
        args: args,
        fees: fees,
        attestations: _attestations,
        blobInputs: endFull.block.batchedBlobInputs,
        proof: ""
      })
    );
  }

  function _createAttestation(address _signer, bytes32 _digest) internal view returns (CommitteeAttestation memory) {
    uint256 privateKey = attesterPrivateKeys[_signer];

    bytes32 digest = _digest.toEthSignedMessageHash();
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

    Signature memory signature = Signature({v: v, r: r, s: s});
    return CommitteeAttestation({addr: _signer, signature: signature});
  }

  function _createEmptyAttestation(address _signer) internal pure returns (CommitteeAttestation memory) {
    Signature memory emptySignature = Signature({v: 0, r: 0, s: 0});
    return CommitteeAttestation({addr: _signer, signature: emptySignature});
  }
}
