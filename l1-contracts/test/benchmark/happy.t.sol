// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {Multicall3} from "./Multicall3.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {
  AttestationLib,
  Signature,
  CommitteeAttestation,
  CommitteeAttestations
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup, BlockLog} from "@aztec/core/Rollup.sol";
import {
  IRollup,
  IRollupCore,
  SubmitEpochRootProofArgs,
  PublicInputArgs,
  RollupConfigInput
} from "@aztec/core/interfaces/IRollup.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {MerkleTestUtil} from "../merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {ProposedHeaderLib} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {ProposeArgs, ProposePayload, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {
  FeeLib,
  FeeAssetPerEthE9,
  EthValue,
  FeeHeader,
  L1FeeData,
  ManaBaseFeeComponents
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {
  FeeModelTestPoints, TestPoint, FeeHeaderModel, ManaBaseFeeComponentsModel
} from "test/fees/FeeModelTestPoints.t.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

// solhint-disable comprehensive-interface

contract FakeCanonical is IRewardDistributor {
  uint256 public constant BLOCK_REWARD = 50e18;
  IERC20 public immutable UNDERLYING;

  address public canonicalRollup;

  constructor(IERC20 _asset) {
    UNDERLYING = _asset;
  }

  function setCanonicalRollup(address _rollup) external {
    canonicalRollup = _rollup;
  }

  function claim(address _recipient, uint256 _amount) external {
    TestERC20(address(UNDERLYING)).mint(_recipient, _amount);
  }

  function distributeFees(address _recipient, uint256 _amount) external {
    TestERC20(address(UNDERLYING)).mint(_recipient, _amount);
  }

  function updateRegistry(IRegistry _registry) external {}
}

contract BenchmarkRollupTest is FeeModelTestPoints, DecoderBase {
  using MessageHashUtils for bytes32;
  using stdStorage for StdStorage;
  using TimeLib for Slot;
  using TimeLib for Timestamp;
  using FeeLib for uint256;
  using FeeLib for ManaBaseFeeComponents;
  // We need to build a block that we can submit. We will be using some values from
  // the empty blocks, but otherwise populate using the fee model test points.

  struct Block {
    ProposeArgs proposeArgs;
    bytes blobInputs;
    CommitteeAttestation[] attestations;
    address[] signers;
  }

  DecoderBase.Full internal full;

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;
  uint256 internal MANA_TARGET;
  uint256 internal TARGET_COMMITTEE_SIZE;
  uint256 internal PROOFS_PER_EPOCH; // given as e2, for simple decimals, e.g., 200 = 2.00
  uint256 internal VOTING_ROUND_SIZE = 500;

  Rollup internal rollup;

  address internal coinbase = address(bytes20("MONEY MAKER"));
  TestERC20 internal asset;
  FakeCanonical internal fakeCanonical;

  CommitteeAttestation internal emptyAttestation;
  mapping(address attester => uint256 privateKey) internal attesterPrivateKeys;

  // Track attestations by block number for proof submission
  mapping(uint256 => CommitteeAttestations) internal blockAttestations;

  Multicall3 internal multicall = new Multicall3();

  SlashingProposer internal slashingProposer;
  IPayload internal slashPayload;

  modifier prepare(uint256 _validatorCount, bool _noValidators) {
    // We deploy a the rollup and sets the time and all to
    vm.warp(l1Metadata[0].timestamp - SLOT_DURATION);

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](_validatorCount);

    for (uint256 i = 1; i < _validatorCount + 1; i++) {
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
    stakingQueueConfig.normalFlushSizeMin = _validatorCount == 0 ? 1 : _validatorCount;

    RollupBuilder builder = new RollupBuilder(address(this)).setProvingCostPerMana(provingCost).setManaTarget(
      MANA_TARGET
    ).setSlotDuration(SLOT_DURATION).setEpochDuration(EPOCH_DURATION).setMintFeeAmount(1e30).setValidators(
      initialValidators
    ).setTargetCommitteeSize(_noValidators ? 0 : TARGET_COMMITTEE_SIZE).setStakingQueueConfig(stakingQueueConfig)
      .setSlashingQuorum(VOTING_ROUND_SIZE).setSlashingRoundSize(VOTING_ROUND_SIZE);
    builder.deploy();

    asset = builder.getConfig().testERC20;
    rollup = builder.getConfig().rollup;
    slashingProposer = Slasher(rollup.getSlasher()).PROPOSER();

    SlashFactory slashFactory = new SlashFactory(IValidatorSelection(address(rollup)));
    address[] memory toSlash = new address[](0);
    uint96[] memory amounts = new uint96[](0);
    uint256[] memory offenses = new uint256[](0);
    slashPayload = slashFactory.createSlashPayload(toSlash, amounts, offenses);

    vm.label(coinbase, "coinbase");
    vm.label(address(rollup), "ROLLUP");
    vm.label(address(asset), "ASSET");
    vm.label(rollup.getBurnAddress(), "BURN_ADDRESS");

    _;
  }

  function setUp() public {
    if (vm.envOr("IGNITION", false)) {
      full = load("empty_block_1");

      SLOT_DURATION = 16 * 12;
      EPOCH_DURATION = 48;
      MANA_TARGET = 0;
      TARGET_COMMITTEE_SIZE = 24;
      PROOFS_PER_EPOCH = 200; // 2.00
    } else {
      full = load("single_tx_block_1");

      SLOT_DURATION = 36;
      EPOCH_DURATION = 32;
      MANA_TARGET = 1e8;
      TARGET_COMMITTEE_SIZE = 48;
      PROOFS_PER_EPOCH = 200; // 2.00
    }

    FeeLib.initialize(MANA_TARGET, EthValue.wrap(100));
  }

  // We manipulate the metadata time here in order to not run "out" of data
  function _loadL1Metadata(uint256 index) internal {
    vm.roll(l1Metadata[0].block_number + index);
    vm.warp(l1Metadata[0].timestamp + index * SLOT_DURATION);
  }

  function test_log_config() public {
    emit log_named_uint("SLOT_DURATION", SLOT_DURATION);
    emit log_named_uint("EPOCH_DURATION", EPOCH_DURATION);
    emit log_named_uint("MANA_TARGET", MANA_TARGET);
    emit log_named_uint("TARGET_COMMITTEE_SIZE", TARGET_COMMITTEE_SIZE);
    emit log_named_uint("PROOFS_PER_EPOCH", PROOFS_PER_EPOCH);
  }

  function test_no_validators() public prepare(0, true) {
    benchmark(false);
  }

  function test_100_validators() public prepare(100, false) {
    benchmark(false);
  }

  function test_100_slashing_validators() public prepare(100, false) {
    benchmark(true);
  }

  function getFakeArchive(uint256 _blockNumber) internal pure returns (bytes32) {
    return keccak256(abi.encode("fake archive", _blockNumber));
  }

  /**
   * @notice Constructs a fake block that is not possible to prove, but passes the L1 checks.
   */
  function getBlock() internal returns (Block memory) {
    // We will be using the genesis for both before and after. This will be impossible
    // to prove, but we don't need to prove anything here.

    ProposedHeader memory header = full.block.header;

    Slot slotNumber = rollup.getCurrentSlot();
    TestPoint memory point = points[Slot.unwrap(slotNumber) - 1];

    Timestamp ts = rollup.getTimestampForSlot(slotNumber);

    uint128 manaBaseFee = SafeCast.toUint128(rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true));
    uint256 manaSpent = point.block_header.mana_spent;

    address proposer = rollup.getCurrentProposer();
    address c = proposer != address(0) ? proposer : coinbase;

    // Updating the header with important information!
    header.lastArchiveRoot = bytes32(Constants.GENESIS_ARCHIVE_ROOT);
    header.slotNumber = slotNumber;
    header.timestamp = ts;
    header.coinbase = c;
    header.feeRecipient = bytes32(0);
    header.gasFees.feePerL2Gas = manaBaseFee;
    if (MANA_TARGET > 0) {
      header.totalManaUsed = manaSpent;
    } else {
      header.totalManaUsed = 0;
    }

    ProposeArgs memory proposeArgs = ProposeArgs({
      header: header,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput({feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier}),
      parentHeaderHash: rollup.getBlock(rollup.getPendingBlockNumber()).headerHash
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

    return Block({
      proposeArgs: proposeArgs,
      blobInputs: full.block.blobCommitments,
      attestations: attestations,
      signers: signers
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

  /**
   * @notice Creates an EIP-712 signature for signalWithSig
   * @param _signer The address that should sign (must match a proposer)
   * @param _payload The payload to signal
   * @return The EIP-712 signature
   */
  function createSignalSignature(address _signer, IPayload _payload, Slot _slot)
    internal
    view
    returns (Signature memory)
  {
    uint256 privateKey = attesterPrivateKeys[_signer];
    require(privateKey != 0, "Private key not found for signer");
    bytes32 digest = slashingProposer.getSignalSignatureDigest(_payload, _slot);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

    return Signature({v: v, r: r, s: s});
  }

  function benchmark(bool _slashing) public {
    // Do nothing for the first epoch
    Slot nextSlot = Slot.wrap(EPOCH_DURATION * 3 + 1);
    Epoch nextEpoch = Epoch.wrap(4);
    bool warmedUp = false;
    // Loop through all of the L1 metadata
    for (uint256 i = 0; i < l1Metadata.length; i++) {
      if (rollup.getPendingBlockNumber() >= 100) {
        break;
      }

      _loadL1Metadata(i);
      uint256 round = slashingProposer.getCurrentRound();

      if (_slashing && !warmedUp && rollup.getCurrentSlot() == Slot.wrap(EPOCH_DURATION * 2)) {
        address proposer = rollup.getCurrentProposer();
        Signature memory sig = createSignalSignature(proposer, slashPayload, rollup.getCurrentSlot());
        slashingProposer.signalWithSig(slashPayload, sig);
        warmedUp = true;
      }

      // For every "new" slot we encounter, we construct a block using current L1 Data
      // and part of the `empty_block_1.json` file. The block cannot be proven, but it
      // will be accepted as a proposal so very useful for testing a long range of blocks.
      if (rollup.getCurrentSlot() == nextSlot) {
        rollup.setupEpoch();

        Block memory b = getBlock();
        address proposer = rollup.getCurrentProposer();

        skipBlobCheck(address(rollup));

        // Store the attestations for the current block number
        uint256 currentBlockNumber = rollup.getPendingBlockNumber() + 1;
        blockAttestations[currentBlockNumber] = AttestationLib.packAttestations(b.attestations);

        if (_slashing) {
          Signature memory sig = createSignalSignature(proposer, slashPayload, rollup.getCurrentSlot());
          Multicall3.Call3[] memory calls = new Multicall3.Call3[](2);
          calls[0] = Multicall3.Call3({
            target: address(rollup),
            callData: abi.encodeCall(
              rollup.propose, (b.proposeArgs, AttestationLib.packAttestations(b.attestations), b.signers, b.blobInputs)
            ),
            allowFailure: false
          });
          calls[1] = Multicall3.Call3({
            target: address(slashingProposer),
            callData: abi.encodeCall(slashingProposer.signalWithSig, (slashPayload, sig)),
            allowFailure: false
          });
          multicall.aggregate3(calls);
        } else {
          CommitteeAttestations memory attestations = AttestationLib.packAttestations(b.attestations);

          // Emit calldata size for propose
          bytes memory proposeCalldata =
            abi.encodeCall(rollup.propose, (b.proposeArgs, attestations, b.signers, b.blobInputs));
          emit log_named_uint("propose_calldata_size", proposeCalldata.length);

          vm.prank(proposer);
          rollup.propose(b.proposeArgs, attestations, b.signers, b.blobInputs);
        }

        nextSlot = nextSlot + Slot.wrap(1);
      }

      // If we are entering a new epoch, we will post a proof
      // Ensure that the fees are split correctly between sequencers and burns etc.
      if (rollup.getCurrentEpoch() == nextEpoch) {
        nextEpoch = nextEpoch + Epoch.wrap(1);
        uint256 pendingBlockNumber = rollup.getPendingBlockNumber();
        uint256 start = rollup.getProvenBlockNumber() + 1;
        uint256 epochSize = 0;
        while (
          start + epochSize <= pendingBlockNumber
            && rollup.getEpochForBlock(start) == rollup.getEpochForBlock(start + epochSize)
        ) {
          epochSize++;
        }

        bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

        for (uint256 feeIndex = 0; feeIndex < epochSize; feeIndex++) {
          // we need the basefee, and we cannot just take it from the point. Because it is different
          Timestamp ts = rollup.getTimestampForSlot(Slot.wrap(start + feeIndex));
          uint256 manaBaseFee = rollup.getManaBaseFeeAt(ts, true);
          uint256 fee = rollup.getFeeHeader(start + feeIndex).manaUsed * manaBaseFee;

          fees[feeIndex * 2] = bytes32(uint256(uint160(bytes20(coinbase))));
          fees[feeIndex * 2 + 1] = bytes32(fee);
        }

        PublicInputArgs memory args = PublicInputArgs({
          previousArchive: rollup.getBlock(start - 1).archive,
          endArchive: getFakeArchive(start + epochSize - 1),
          proverId: address(0)
        });
        assertNotEq(args.previousArchive, bytes32(0));

        {
          SubmitEpochRootProofArgs memory submitArgs = SubmitEpochRootProofArgs({
            start: start,
            end: start + epochSize - 1,
            args: args,
            fees: fees,
            attestations: blockAttestations[start + epochSize - 1],
            blobInputs: full.block.batchedBlobInputs,
            proof: ""
          });

          // Emit calldata size for submitEpochRootProof
          bytes memory submitCalldata = abi.encodeCall(rollup.submitEpochRootProof, (submitArgs));
          emit log_named_uint("submitEpochRootProof_calldata_size", submitCalldata.length);

          rollup.submitEpochRootProof(submitArgs);
        }
      }
    }
  }
}
