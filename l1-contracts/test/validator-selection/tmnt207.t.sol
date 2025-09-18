// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {ProposeArgs, ProposePayload, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {RollupBase, IInstance} from "../base/RollupBase.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {TimeCheater} from "../staking/TimeCheater.sol";
import {Bps, BpsLib} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {
  AttestationLib,
  Signature,
  CommitteeAttestation,
  CommitteeAttestations
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {ProposedHeaderLib} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {
  IRollup,
  IRollupCore,
  SubmitEpochRootProofArgs,
  PublicInputArgs,
  RollupConfigInput
} from "@aztec/core/interfaces/IRollup.sol";
import {Signature, SignatureLib__InvalidSignature} from "@aztec/shared/libraries/SignatureLib.sol";
// solhint-disable comprehensive-interface

struct Block {
  ProposeArgs proposeArgs;
  bytes blobInputs;
  CommitteeAttestation[] attestations;
  address[] signers;
  Signature attestationsAndSignersSignature;
}

contract Tmnt207Test is RollupBase {
  using MessageHashUtils for bytes32;
  using ProposeLib for ProposeArgs;
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  Registry internal registry;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;
  RewardDistributor internal rewardDistributor;
  TimeCheater internal timeCheater;

  CommitteeAttestation internal emptyAttestation;
  mapping(address attester => uint256 privateKey) internal attesterPrivateKeys;

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;
  uint256 internal PROOF_SUBMISSION_EPOCHS;
  uint256 internal MANA_TARGET = 0;
  uint256 internal COMMITTEE_SIZE = 4;

  address internal sequencer = address(bytes20("sequencer"));

  DecoderBase.Full internal full;

  /**
   * @notice  Set up the contracts needed for the tests with time aligned to the provided block name
   */
  modifier setUpFor(string memory _name) {
    {
      full = load(_name);
      Slot slotNumber = full.block.header.slotNumber;
      uint256 initialTime = Timestamp.unwrap(full.block.header.timestamp) - Slot.unwrap(slotNumber) * SLOT_DURATION;
      vm.warp(initialTime);
    }

    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
    EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
    PROOF_SUBMISSION_EPOCHS = TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS;
    timeCheater =
      new TimeCheater(address(this), block.timestamp, SLOT_DURATION, EPOCH_DURATION, PROOF_SUBMISSION_EPOCHS);

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](COMMITTEE_SIZE);

    for (uint256 i = 1; i < COMMITTEE_SIZE + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);
      attesterPrivateKeys[attester] = attesterPrivateKey;

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        withdrawer: address(this),
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }

    StakingQueueConfig memory stakingQueueConfig = TestConstants.getStakingQueueConfig();
    stakingQueueConfig.normalFlushSizeMin = COMMITTEE_SIZE == 0 ? 1 : COMMITTEE_SIZE;

    RollupBuilder builder = new RollupBuilder(address(this)).setManaTarget(MANA_TARGET).setTargetCommitteeSize(
      COMMITTEE_SIZE
    ).setValidators(initialValidators).setStakingQueueConfig(stakingQueueConfig);
    builder.deploy();

    rollup = IInstance(address(builder.getConfig().rollup));
    testERC20 = builder.getConfig().testERC20;
    registry = builder.getConfig().registry;

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));
    rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));

    _;
  }

  function test_livelock() public setUpFor("empty_block_1") {
    // The attacker will frontrun the transaction to submit invalid attestation/signers inputs
    // Thereby blocking the real block submission, but also make it impossible to prove
    // so it needs to be invalidated. A DOS vector.

    skipBlobCheck(address(rollup));
    timeCheater.cheat__progressEpoch();
    timeCheater.cheat__progressEpoch();

    // Say that someone builds a perfectly nice block
    Block memory l2BlockReal = getBlock();
    Block memory l2Block = getBlock();
    address proposer = rollup.getCurrentProposer();

    // But a malicious man steps in. Take that block, and messes up some of the `attestations` values
    address attacker = address(0xdeadbeefbedead);

    // Then, MESS the signatures that is not the proposer up!
    // This way we can still rebuild the same committee, during propose, but impossible to make it pass during proving
    {
      for (uint256 i = 0; i < l2Block.attestations.length; i++) {
        if (l2Block.attestations[i].addr != proposer && l2Block.attestations[i].signature.v != 0) {
          l2Block.attestations[i].signature.v = 1;
          l2Block.attestations[i].signature.r = bytes32(uint256(1));
          l2Block.attestations[i].signature.s = bytes32(uint256(1));
        }
      }

      vm.prank(attacker);
      vm.expectRevert(); // SignatureLib__InvalidSignature.selector
      rollup.propose(
        l2Block.proposeArgs,
        AttestationLibHelper.packAttestations(l2Block.attestations),
        l2Block.signers,
        l2Block.attestationsAndSignersSignature,
        l2Block.blobInputs
      );
    }

    // It is also possible to alter the signers if needed. Find someone that is not a signer! And add a signature
    // When we change the `signers` we need also change the attestations to recreate the correct committee.
    {
      address[] memory signers = new address[](l2Block.signers.length + 1);
      uint256 signersIndex = 0;
      bool haveAddedSigner = false;
      for (uint256 i = 0; i < l2Block.attestations.length; i++) {
        if (!haveAddedSigner && l2Block.attestations[i].addr != proposer && l2Block.attestations[i].signature.v == 0) {
          l2Block.attestations[i].signature.v = 1;
          l2Block.attestations[i].signature.r = bytes32(uint256(1));
          l2Block.attestations[i].signature.s = bytes32(uint256(1));
          haveAddedSigner = true;
        }

        if (l2Block.attestations[i].signature.v != 0) {
          signers[signersIndex] = l2Block.attestations[i].addr;
          signersIndex++;
        }
      }

      vm.prank(attacker);
      vm.expectRevert(); // SignatureLib__InvalidSignature.selector
      rollup.propose(
        l2Block.proposeArgs,
        AttestationLibHelper.packAttestations(l2Block.attestations),
        signers,
        l2Block.attestationsAndSignersSignature,
        l2Block.blobInputs
      );
    }

    // Real
    {
      vm.prank(proposer);
      rollup.propose(
        l2BlockReal.proposeArgs,
        AttestationLibHelper.packAttestations(l2BlockReal.attestations),
        l2BlockReal.signers,
        l2BlockReal.attestationsAndSignersSignature,
        l2BlockReal.blobInputs
      );
    }

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: 1,
        end: 1,
        args: PublicInputArgs({
          previousArchive: rollup.getBlock(0).archive,
          endArchive: rollup.getBlock(1).archive,
          proverId: address(0)
        }),
        fees: new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2),
        attestations: AttestationLibHelper.packAttestations(l2BlockReal.attestations),
        blobInputs: full.block.batchedBlobInputs,
        proof: ""
      })
    );
  }

  function getBlock() internal returns (Block memory) {
    // We will be using the genesis for both before and after. This will be impossible
    // to prove, but we don't need to prove anything here.
    bytes32 archiveRoot = bytes32(Constants.GENESIS_ARCHIVE_ROOT);

    ProposedHeader memory header = full.block.header;

    Slot slotNumber = rollup.getCurrentSlot();
    Timestamp ts = rollup.getTimestampForSlot(slotNumber);

    address proposer = rollup.getCurrentProposer();

    // Updating the header with important information!
    header.lastArchiveRoot = archiveRoot;
    header.slotNumber = slotNumber;
    header.timestamp = ts;
    header.coinbase = address(bytes20("coinbase"));
    header.feeRecipient = bytes32(0);
    header.gasFees.feePerL2Gas = SafeCast.toUint128(rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true));
    if (MANA_TARGET > 0) {
      header.totalManaUsed = MANA_TARGET;
    } else {
      header.totalManaUsed = 0;
    }

    ProposeArgs memory proposeArgs = ProposeArgs({
      header: header,
      archive: archiveRoot,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput({feeAssetPriceModifier: 0})
    });

    CommitteeAttestation[] memory attestations;
    address[] memory signers;

    {
      address[] memory validators = rollup.getEpochCommittee(rollup.getCurrentEpoch());
      uint256 needed = validators.length * 2 / 3 + 1;
      attestations = new CommitteeAttestation[](validators.length);
      signers = new address[](needed);

      bytes32 headerHash = ProposedHeaderLib.hash(proposeArgs.header);

      ProposePayload memory proposePayload = ProposePayload({
        archive: proposeArgs.archive,
        stateReference: proposeArgs.stateReference,
        oracleInput: proposeArgs.oracleInput,
        headerHash: headerHash
      });

      bytes32 digest = ProposeLib.digest(proposePayload);

      // loop through to make sure we create an attestation for the proposer
      for (uint256 i = 0; i < validators.length; i++) {
        if (validators[i] == proposer) {
          attestations[i] = createAttestation(validators[i], digest);
        }
      }

      // loop to get to the required number of attestations.
      // yes, inefficient, but it's simple, clear, and is a test.
      uint256 sigCount = 1;
      uint256 signersIndex = 0;
      for (uint256 i = 0; i < validators.length; i++) {
        if (validators[i] == proposer) {
          signers[signersIndex] = validators[i];
          signersIndex++;
        } else if (sigCount < needed) {
          attestations[i] = createAttestation(validators[i], digest);
          signers[signersIndex] = validators[i];
          sigCount++;
          signersIndex++;
        } else {
          attestations[i] = createEmptyAttestation(validators[i]);
        }
      }
    }

    Signature memory attestationsAndSignersSignature;
    if (proposer != address(0)) {
      attestationsAndSignersSignature = createAttestation(
        proposer,
        AttestationLib.getAttestationsAndSignersDigest(AttestationLibHelper.packAttestations(attestations), signers)
      ).signature;
    }

    return Block({
      proposeArgs: proposeArgs,
      blobInputs: full.block.blobCommitments,
      attestations: attestations,
      signers: signers,
      attestationsAndSignersSignature: attestationsAndSignersSignature
    });
  }

  function createAttestation(address _signer, bytes32 _digest) internal view returns (CommitteeAttestation memory) {
    uint256 privateKey = attesterPrivateKeys[_signer];

    bytes32 digest = _digest.toEthSignedMessageHash();
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

    Signature memory signature = Signature({v: v, r: r, s: s});
    // Address can be zero for signed attestations
    return CommitteeAttestation({addr: _signer, signature: signature});
  }

  // This is used for attestations that are not signed - we include their address to help reconstruct the committee
  // commitment
  function createEmptyAttestation(address _signer) internal pure returns (CommitteeAttestation memory) {
    Signature memory emptySignature = Signature({v: 0, r: 0, s: 0});
    return CommitteeAttestation({addr: _signer, signature: emptySignature});
  }
}
