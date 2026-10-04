// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ProvenCheckpointFees} from "@aztec/core/interfaces/IRollup.sol";

import {DecoderBase} from "../base/DecoderBase.sol";

import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {Multicall3} from "./Multicall3.sol";
import {PartialEpochProofGasReporter} from "./PartialEpochProofGasReporter.sol";

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
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup, CheckpointLog} from "@aztec/core/Rollup.sol";
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
  EthPerFeeAssetE12,
  EthValue,
  FeeHeader,
  L1FeeData,
  ManaMinFeeComponents
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {
  FeeModelTestPoints,
  TestPoint,
  FeeHeaderModel,
  ManaMinFeeComponentsModel
} from "test/fees/FeeModelTestPoints.t.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {Config, RollupBuilder} from "../builder/RollupBuilder.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {SlashRound} from "@aztec/core/libraries/SlashRoundLib.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";
import {RewardConfig, BpsLib} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {
  CALCULATOR_GAS_BASE,
  CALCULATOR_GAS_PER_CHECKPOINT,
  CALCULATOR_CALL_GAS_RESERVE
} from "@aztec/core/libraries/rollup/SequencerRewardCalculatorLib.sol";
import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {
  TableCalculator,
  GasReportingCalculator,
  GasBurningCalculator
} from "@test/mock/SequencerRewardCalculatorMocks.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {GSEWithSkip} from "@test/GSEWithSkip.sol";
import {RegistryReductionCalculator} from "@test/reward-calculators/reduction/RegistryReductionCalculator.sol";
import {
  MockATP,
  MockATPStaker,
  MockATPStakerImplementation,
  deployMainnetShapedATPStaker,
  deployMockATPStaker
} from "@test/reward-calculators/mocks/ATPMocks.sol";
import {IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPFactory} from "@test/reward-calculators/premium/PremiumATPFactory.sol";
import {PremiumATPRegistry, UnlockSchedule} from "@test/reward-calculators/premium/PremiumATPRegistry.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {PremiumRewardCalculator} from "@test/reward-calculators/premium/PremiumRewardCalculator.sol";
import {
  FakeWithdrawer,
  MockRollupRegistry,
  MockStakingRollup
} from "@test/reward-calculators/premium/mocks/PremiumMocks.sol";

// solhint-disable comprehensive-interface

contract FakeCanonical is IRewardDistributor {
  uint256 public constant CHECKPOINT_REWARD = 50e18;
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

  function recoverFrom(address _from, address _to, uint256 _amount) external {}
  function recoverWrongAsset(address _asset, address _to, uint256 _amount) external {}

  function subsidizeAddress(address, uint256) external {}

  function availableTo(address) external pure returns (uint256) {
    return type(uint256).max;
  }
}

abstract contract BenchmarkRollupBase is FeeModelTestPoints, DecoderBase {
  using stdStorage for StdStorage;
  using TimeLib for Slot;
  using TimeLib for Timestamp;
  using FeeLib for uint256;
  using FeeLib for ManaMinFeeComponents;
  // We need to build a checkpoint that we can submit. We will be using some values from
  // the empty checkpoints, but otherwise populate using the fee model test points.

  struct Checkpoint {
    ProposeArgs proposeArgs;
    bytes blobInputs;
    CommitteeAttestation[] attestations;
    address[] signers;
    Signature attestationsAndSignersSignature;
  }

  enum TestSlash {
    NONE,
    TALLY
  }

  DecoderBase.Full internal full;

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;
  uint256 internal MANA_TARGET;
  uint256 internal TARGET_COMMITTEE_SIZE;
  uint256 internal PROOFS_PER_EPOCH; // given as e2, for simple decimals, e.g., 200 = 2.00
  uint256 internal VOTING_ROUND_SIZE = 500;

  Rollup internal rollup;
  Slasher internal slasher;

  address internal coinbase = address(bytes20("MONEY MAKER"));
  TestERC20 internal asset;
  FakeCanonical internal fakeCanonical;

  CommitteeAttestation internal emptyAttestation;
  mapping(address attester => uint256 privateKey) internal attesterPrivateKeys;

  // Track attestations by checkpoint number for proof submission
  mapping(uint256 => CommitteeAttestations) internal checkpointAttestations;

  mapping(uint256 => ProposedHeader) internal checkpointHeaders;

  Multicall3 internal multicall = new Multicall3();

  address internal slashingProposer;

  modifier prepare(uint256 _validatorCount, bool _noValidators, TestSlash _slashing) {
    _prepare(_validatorCount, _noValidators, _slashing);
    _;
  }

  function _prepare(uint256 _validatorCount, bool _noValidators, TestSlash _slashing)
    internal
    returns (RollupBuilder builder)
  {
    vm.warp(l1Metadata[0].timestamp - SLOT_DURATION);

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](_validatorCount);

    for (uint256 i = 1; i < _validatorCount + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);
      attesterPrivateKeys[attester] = attesterPrivateKey;

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        withdrawer: _validatorWithdrawer(i - 1),
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }

    StakingQueueConfig memory stakingQueueConfig = TestConstants.getStakingQueueConfig();
    stakingQueueConfig.normalFlushSizeMin = _validatorCount == 0 ? 1 : _validatorCount;

    builder = new RollupBuilder(address(this)).setProvingCostPerMana(provingCost).setManaTarget(MANA_TARGET)
      .setSlotDuration(SLOT_DURATION).setEpochDuration(EPOCH_DURATION).setMintFeeAmount(1e30)
      .setValidators(initialValidators).setTargetCommitteeSize(_noValidators ? 0 : TARGET_COMMITTEE_SIZE)
      .setStakingQueueConfig(stakingQueueConfig);

    _configureRollupBuilder(builder);

    if (_slashing == TestSlash.TALLY) {
      // For tally slashing, we need a round size that's a multiple of epoch duration
      uint256 tallyRoundSize = EPOCH_DURATION * 2; // 64; // 2 * EPOCH_DURATION (32) = 64
      uint256 tallyQuorum = tallyRoundSize / 2 + 1; // Must be > ROUND_SIZE / 2
      builder.setSlasherEnabled(true).setSlashingQuorum(tallyQuorum).setSlashingRoundSize(tallyRoundSize)
        .setSlashingLifetimeInRounds(5).setSlashingExecutionDelayInRounds(1).setSlashAmountSmall(1e18)
        .setSlashAmountMedium(2e18).setSlashAmountLarge(3e18);
    }

    builder.deploy();

    Config memory config = builder.getConfig();
    asset = config.testERC20;
    rollup = config.rollup;
    slasher = Slasher(rollup.getSlasher());
    slashingProposer = address(slasher) == address(0) ? address(0) : slasher.PROPOSER();

    vm.label(coinbase, "coinbase");
    vm.label(address(rollup), "ROLLUP");
    vm.label(address(asset), "ASSET");
    vm.label(rollup.getProtocolFeeRecipient(), "BURN_ADDRESS");
  }

  function _validatorWithdrawer(uint256) internal view virtual returns (address) {
    return address(this);
  }

  function _configureRollupBuilder(RollupBuilder) internal virtual {}

  function _installPartialEpochProofGasReporter(RollupBuilder _builder) internal {
    Config memory config = _builder.getConfig();
    PartialEpochProofGasReporter reporter = new PartialEpochProofGasReporter(
      config.testERC20,
      config.testERC20,
      config.gse,
      rollup.getEpochProofVerifier(),
      address(this),
      config.genesisState,
      config.rollupConfigInput,
      rollup.getOutbox(),
      rollup.getFeeAssetPortal(),
      rollup.getInbox()
    );
    // Keep the initialized rollup storage while exposing named gas-report entrypoints.
    vm.etch(address(rollup), address(reporter).code);
  }

  function setUp() public virtual {
    full = load("single_tx_checkpoint_1");

    SLOT_DURATION = 72;
    EPOCH_DURATION = 32;
    MANA_TARGET = 1e8;
    TARGET_COMMITTEE_SIZE = 48;
    PROOFS_PER_EPOCH = 200; // 2.00

    FeeLib.initialize(MANA_TARGET, EthValue.wrap(100), TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET);
  }

  // We manipulate the metadata time here in order to not run "out" of data
  function _loadL1Metadata(uint256 index) internal {
    vm.roll(l1Metadata[0].block_number + index);
    vm.warp(l1Metadata[0].timestamp + index * SLOT_DURATION);
  }

  /**
   * @notice Constructs a fake checkpoint that is not possible to prove, but passes the L1 checks.
   */
  function getCheckpoint() internal returns (Checkpoint memory) {
    // We will be using the genesis for both before and after. This will be impossible
    // to prove, but we don't need to prove anything here.
    bytes32 archiveRoot = bytes32(Constants.GENESIS_ARCHIVE_ROOT);

    ProposedHeader memory header = full.checkpoint.header;

    Slot slotNumber = rollup.getCurrentSlot();
    TestPoint memory point = points[Slot.unwrap(slotNumber) - 1];

    Timestamp ts = rollup.getTimestampForSlot(slotNumber);

    uint128 manaMinFee = SafeCast.toUint128(rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true));
    uint256 manaSpent = point.checkpoint_header.mana_spent;

    address proposer = rollup.getCurrentProposer();
    address c = proposer != address(0) ? proposer : coinbase;

    // Updating the header with important information!
    header.lastArchiveRoot = archiveRoot;
    header.slotNumber = slotNumber;
    header.timestamp = ts;
    header.coinbase = c;
    header.feeRecipient = bytes32(0);
    header.gasFees.feePerL2Gas = manaMinFee;
    header.totalManaUsed = manaSpent;
    header.accumulatedFees = uint256(manaMinFee) * manaSpent;

    // Streaming Inbox: reference the newest bucket (nothing seeded here, so the genesis bucket).
    uint256 bucketHint = rollup.getInbox().getCurrentBucketSeq();
    header.inboxRollingHash = rollup.getInbox().getBucket(bucketHint).rollingHash;

    ProposeArgs memory proposeArgs = ProposeArgs({
      header: header,
      archive: archiveRoot,
      oracleInput: OracleInput({feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier}),
      bucketHint: bucketHint
    });

    CommitteeAttestation[] memory attestations;
    address[] memory signers;

    {
      address[] memory validators = rollup.getEpochCommittee(rollup.getCurrentEpoch());
      uint256 needed = validators.length * 2 / 3 + 1;
      attestations = new CommitteeAttestation[](validators.length);
      signers = new address[](needed);

      bytes32 headerHash = ProposedHeaderLib.hash(proposeArgs.header);

      ProposePayload memory proposePayload =
        ProposePayload({archive: proposeArgs.archive, oracleInput: proposeArgs.oracleInput, headerHash: headerHash});

      bytes32 digest = ProposeLib.digest(proposePayload, address(rollup));

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
        AttestationLib.getAttestationsAndSignersDigest(
          AttestationLibHelper.packAttestations(attestations), signers, address(rollup)
        )
      ).signature;
    }

    return Checkpoint({
      proposeArgs: proposeArgs,
      blobInputs: full.checkpoint.blobCommitments,
      attestations: attestations,
      signers: signers,
      attestationsAndSignersSignature: attestationsAndSignersSignature
    });
  }

  function createAttestation(address _signer, bytes32 _digest) internal view returns (CommitteeAttestation memory) {
    uint256 privateKey = attesterPrivateKeys[_signer];

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, _digest);

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
   * @notice Creates vote data for tally slashing
   * @param _size - The number of validators
   * @return Encoded vote data
   */
  function createTallyVoteData(uint256 _size) internal view returns (bytes memory) {
    require(_size % 4 == 0, "Vote data must have multiple of 4 validators");

    bytes32 seed = keccak256(abi.encode(_size, block.timestamp));

    bytes memory voteData = new bytes(_size / 4);

    for (uint256 i = 0; i < _size; i += 4) {
      uint8 validator0 = uint8(uint256(keccak256(abi.encode(seed, i)))) & 0x03; // 2 bits
      uint8 validator1 = uint8(uint256(keccak256(abi.encode(seed, i + 1)))) & 0x03; // 2 bits
      uint8 validator2 = uint8(uint256(keccak256(abi.encode(seed, i + 2)))) & 0x03; // 2 bits
      uint8 validator3 = uint8(uint256(keccak256(abi.encode(seed, i + 3)))) & 0x03; // 2 bits
      voteData[i / 4] = bytes1((validator3 << 6) | (validator2 << 4) | (validator1 << 2) | validator0);
    }

    return voteData;
  }

  /**
   * @notice Creates an EIP-712 signature for tally voting
   * @param _signer The address that should sign (must match a proposer)
   * @param votes The vote data to sign
   * @param slot The current slot
   * @return The EIP-712 signature
   */
  function createTallyVoteSignature(address _signer, bytes memory votes, Slot slot)
    internal
    view
    returns (Signature memory)
  {
    uint256 privateKey = attesterPrivateKeys[_signer];
    require(privateKey != 0, "Private key not found for signer");
    bytes32 digest = SlashingProposer(slashingProposer).getVoteSignatureDigest(votes, slot);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

    return Signature({v: v, r: r, s: s});
  }

  function proposeWithTallyVote(Checkpoint memory b, address proposer) internal {
    // First propose the checkpoint
    CommitteeAttestations memory attestations = AttestationLibHelper.packAttestations(b.attestations);

    uint256 committeeSize = rollup.getEpochCommittee(rollup.getCurrentEpoch()).length;
    uint256 roundSizeInEpochs = 2;
    bytes memory voteData = createTallyVoteData(committeeSize * roundSizeInEpochs);
    Signature memory sig = createTallyVoteSignature(proposer, voteData, rollup.getCurrentSlot());

    Multicall3.Call3[] memory calls = new Multicall3.Call3[](2);
    calls[0] = Multicall3.Call3({
      target: address(rollup),
      callData: abi.encodeCall(
        rollup.propose, (b.proposeArgs, attestations, b.signers, b.attestationsAndSignersSignature, b.blobInputs)
      ),
      allowFailure: false
    });
    calls[1] = Multicall3.Call3({
      target: address(slashingProposer),
      callData: abi.encodeCall(SlashingProposer(slashingProposer).vote, (voteData, sig)),
      allowFailure: false
    });
    multicall.aggregate3(calls);
  }

  function benchmark(TestSlash _slashing) public {
    // Do nothing for the first epoch
    Slot nextSlot = Slot.wrap(EPOCH_DURATION * 3 + 1);
    Epoch nextEpoch = Epoch.wrap(4);
    uint256 stopAtCheckpoint = 150;

    // Loop through all of the L1 metadata
    for (uint256 i = 0; i < l1Metadata.length; i++) {
      if (rollup.getPendingCheckpointNumber() >= stopAtCheckpoint) {
        break;
      }

      _loadL1Metadata(i);

      // For every "new" slot we encounter, we construct a checkpoint using current L1 data and
      // the decoded checkpoint fixture. The checkpoint cannot be proven, but it will be accepted
      // as a proposal so it is useful for testing a long range of checkpoints.
      if (rollup.getCurrentSlot() == nextSlot) {
        rollup.setupEpoch();

        Checkpoint memory b = getCheckpoint();
        address proposer = rollup.getCurrentProposer();

        skipBlobCheck(address(rollup));

        // Store the attestations and header for the current checkpoint number
        uint256 currentCheckpointNumber = rollup.getPendingCheckpointNumber() + 1;
        checkpointAttestations[currentCheckpointNumber] = AttestationLibHelper.packAttestations(b.attestations);
        checkpointHeaders[currentCheckpointNumber] = b.proposeArgs.header;

        if (_slashing == TestSlash.TALLY) {
          SlashRound slashRound = SlashingProposer(slashingProposer).getCurrentRound();
          // We are offset + 1, because the first round after the offset is used entirely on warming the storage up, so
          // we don't get a off-balance update
          if (SlashRound.unwrap(slashRound) >= 3) {
            // SLASH_OFFSET_IN_ROUNDS
            proposeWithTallyVote(b, proposer);
          } else {
            // Before slash offset, just propose normally
            CommitteeAttestations memory attestations = AttestationLibHelper.packAttestations(b.attestations);
            vm.prank(proposer);
            rollup.propose(b.proposeArgs, attestations, b.signers, b.attestationsAndSignersSignature, b.blobInputs);
          }
        } else {
          CommitteeAttestations memory attestations = AttestationLibHelper.packAttestations(b.attestations);

          // Emit calldata size for propose
          bytes memory proposeCalldata = abi.encodeCall(
            rollup.propose, (b.proposeArgs, attestations, b.signers, b.attestationsAndSignersSignature, b.blobInputs)
          );
          emit log_named_uint("propose_calldata_size", proposeCalldata.length);

          vm.prank(proposer);
          rollup.propose(b.proposeArgs, attestations, b.signers, b.attestationsAndSignersSignature, b.blobInputs);
        }

        nextSlot = nextSlot + Slot.wrap(1);
      }

      // If we are entering a new epoch, we will post a proof
      // Ensure that the fees are split correctly between sequencers and burns etc.
      if (rollup.getCurrentEpoch() == nextEpoch) {
        nextEpoch = nextEpoch + Epoch.wrap(1);
        uint256 pendingCheckpointNumber = rollup.getPendingCheckpointNumber();
        uint256 start = rollup.getProvenCheckpointNumber() + 1;
        uint256 epochSize = 0;
        while (
          start + epochSize <= pendingCheckpointNumber
            && rollup.getEpochForCheckpoint(start) == rollup.getEpochForCheckpoint(start + epochSize)
        ) {
          epochSize++;
        }

        ProposedHeader[] memory headers = new ProposedHeader[](epochSize);
        for (uint256 headerIndex = 0; headerIndex < epochSize; headerIndex++) {
          headers[headerIndex] = checkpointHeaders[start + headerIndex];
        }

        CheckpointLog memory endCheckpoint = rollup.getCheckpoint(start + epochSize - 1);

        PublicInputArgs memory args = PublicInputArgs({
          previousArchive: rollup.getCheckpoint(start).archive,
          endArchive: endCheckpoint.archive,
          outHash: endCheckpoint.outHash,
          previousInboxRollingHash: 0,
          endInboxRollingHash: 0,
          proverId: address(0)
        });

        {
          SubmitEpochRootProofArgs memory submitArgs = SubmitEpochRootProofArgs({
            start: start,
            end: start + epochSize - 1,
            args: args,
            provenCheckpointFees: new ProvenCheckpointFees[](0),
            headers: headers,
            attestations: checkpointAttestations[start + epochSize - 1],
            blobInputs: full.checkpoint.batchedBlobInputs,
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

contract BenchmarkRollupTest is BenchmarkRollupBase {
  function test_log_config() public {
    emit log_named_uint("SLOT_DURATION", SLOT_DURATION);
    emit log_named_uint("EPOCH_DURATION", EPOCH_DURATION);
    emit log_named_uint("MANA_TARGET", MANA_TARGET);
    emit log_named_uint("TARGET_COMMITTEE_SIZE", TARGET_COMMITTEE_SIZE);
    emit log_named_uint("PROOFS_PER_EPOCH", PROOFS_PER_EPOCH);
  }

  function test_no_validators() public prepare(0, true, TestSlash.NONE) {
    benchmark(TestSlash.NONE);
  }

  function test_100_validators() public prepare(100, false, TestSlash.NONE) {
    benchmark(TestSlash.NONE);
  }

  function test_100_slashing_validators() public prepare(100, false, TestSlash.TALLY) {
    benchmark(TestSlash.TALLY);
  }
}

abstract contract PartialEpochProofGasReportBase is BenchmarkRollupBase {
  uint256 internal constant ROOT_PROOF_SIZE = 331 * 32;
  uint256 internal constant GAS_REPORT_EPOCH = 4;

  bytes32 internal gasReportPreviousArchive;
  mapping(uint256 checkpointNumber => bytes32 archive) internal gasReportArchives;
  mapping(uint256 checkpointNumber => bytes32 outHash) internal gasReportOutHashes;
  mapping(uint256 checkpointNumber => bytes32 inboxRollingHash) internal gasReportInboxRollingHashes;

  /// @dev Seed one Inbox message a slot before the fixture epoch, so every checkpoint consumes bucket 1.
  function _seedInitialInboxBucket() internal view virtual returns (bool) {
    return false;
  }

  /// @dev Seed a second Inbox message just before checkpoint 9, so checkpoints 9 and up consume bucket 2.
  function _seedSecondInboxBucket() internal view virtual returns (bool) {
    return false;
  }

  function setUp() public virtual override {
    super.setUp();
    RollupBuilder builder = _prepare(48, false, TestSlash.NONE);
    // Propose against the deployed Rollup before etching. `propose` reads the `INBOX` immutable out of the running
    // code, so proposals made through the reporter would validate against the reporter's own Inbox, whose `ROLLUP`
    // is the reporter's deployment address rather than this one.
    _prepareGasReportEpoch();
    _installPartialEpochProofGasReporter(builder);
  }

  function _sendInboxMessage(uint256 _salt) internal {
    vm.prank(address(this));
    Inbox(address(rollup.getInbox()))
      .sendL2Message(
        DataStructures.L2Actor({actor: bytes32(_salt), version: rollup.getVersion()}), bytes32(_salt), bytes32(0)
      );
  }

  function _prepareGasReportEpoch() internal {
    Slot firstSlot = Slot.wrap(EPOCH_DURATION * GAS_REPORT_EPOCH);
    Slot endSlot = firstSlot + Slot.wrap(EPOCH_DURATION);
    bool inboxSeeded;

    for (uint256 i = 0; i < l1Metadata.length; i++) {
      _loadL1Metadata(i);

      Slot currentSlot = rollup.getCurrentSlot();
      if (currentSlot < firstSlot) {
        if (_seedInitialInboxBucket() && !inboxSeeded && currentSlot + Slot.wrap(1) == firstSlot) {
          _sendInboxMessage(1);
          inboxSeeded = true;
        }
        continue;
      }
      if (currentSlot >= endSlot) {
        break;
      }

      rollup.setupEpoch();

      // A bucket only settles once its L1 block has passed, so open bucket 2 slightly before checkpoint 9's
      // proposal timestamp rather than at it.
      if (_seedSecondInboxBucket() && rollup.getPendingCheckpointNumber() == 8) {
        uint256 timestamp = block.timestamp;
        vm.warp(timestamp - 12);
        _sendInboxMessage(2);
        vm.warp(timestamp);
      }

      Checkpoint memory checkpoint = getCheckpoint();
      address proposer = rollup.getCurrentProposer();

      skipBlobCheck(address(rollup));

      uint256 checkpointNumber = rollup.getPendingCheckpointNumber() + 1;
      checkpointAttestations[checkpointNumber] = AttestationLibHelper.packAttestations(checkpoint.attestations);
      checkpointHeaders[checkpointNumber] = checkpoint.proposeArgs.header;
      gasReportArchives[checkpointNumber] = checkpoint.proposeArgs.archive;
      gasReportOutHashes[checkpointNumber] = checkpoint.proposeArgs.header.outHash;
      gasReportInboxRollingHashes[checkpointNumber] = checkpoint.proposeArgs.header.inboxRollingHash;

      if (checkpointNumber == 1) {
        gasReportPreviousArchive = checkpoint.proposeArgs.header.lastArchiveRoot;
      }

      CommitteeAttestations memory attestations = AttestationLibHelper.packAttestations(checkpoint.attestations);
      vm.prank(proposer);
      rollup.propose(
        checkpoint.proposeArgs,
        attestations,
        checkpoint.signers,
        checkpoint.attestationsAndSignersSignature,
        checkpoint.blobInputs
      );
    }

    assertEq(rollup.getPendingCheckpointNumber(), EPOCH_DURATION);
    assertEq(inboxSeeded, _seedInitialInboxBucket());
    assertEq(rollup.getEpochCommittee(Epoch.wrap(GAS_REPORT_EPOCH)).length, 48);
  }

  function _getGasReportSubmission(uint256 _length) internal view returns (SubmitEpochRootProofArgs memory submitArgs) {
    ProposedHeader[] memory headers = new ProposedHeader[](_length);
    for (uint256 i = 0; i < _length; i++) {
      headers[i] = checkpointHeaders[i + 1];
    }

    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: gasReportPreviousArchive,
      endArchive: gasReportArchives[_length],
      outHash: gasReportOutHashes[_length],
      previousInboxRollingHash: 0,
      endInboxRollingHash: gasReportInboxRollingHashes[_length],
      proverId: address(this)
    });

    // Root UltraKeccak proofs contain 331 fields; the mock verifier still needs production-sized calldata.
    bytes memory proof = new bytes(ROOT_PROOF_SIZE);

    submitArgs = SubmitEpochRootProofArgs({
      start: 1,
      end: _length,
      args: args,
      provenCheckpointFees: new ProvenCheckpointFees[](0),
      headers: headers,
      attestations: checkpointAttestations[_length],
      blobInputs: full.checkpoint.batchedBlobInputs,
      proof: proof
    });
  }

  function _gasReporter() internal view returns (PartialEpochProofGasReporter) {
    return PartialEpochProofGasReporter(address(rollup));
  }

  function _compactSubmission(SubmitEpochRootProofArgs memory _args, uint256 _prefixLength)
    internal
    pure
    returns (SubmitEpochRootProofArgs memory)
  {
    _args.provenCheckpointFees = new ProvenCheckpointFees[](_prefixLength);
    ProposedHeader[] memory headers = new ProposedHeader[](_args.headers.length - _prefixLength);
    for (uint256 i = 0; i < _prefixLength; i++) {
      _args.provenCheckpointFees[i] = ProvenCheckpointFees(_args.headers[i].coinbase, _args.headers[i].accumulatedFees);
    }
    for (uint256 i = 0; i < headers.length; i++) {
      headers[i] = _args.headers[_prefixLength + i];
    }
    _args.headers = headers;
    return _args;
  }
}

contract PartialEpochProofGasReportTest is PartialEpochProofGasReportBase {
  function testGasReportSubmit1Checkpoint() public {
    _gasReporter().gasReportSubmit1Checkpoint(_getGasReportSubmission(1));
    assertEq(rollup.getProvenCheckpointNumber(), 1);
  }

  function testGasReportSubmit8Checkpoints() public {
    _gasReporter().gasReportSubmit8Checkpoints(_getGasReportSubmission(8));
    assertEq(rollup.getProvenCheckpointNumber(), 8);
  }

  function testGasReportSubmit16Checkpoints() public {
    _gasReporter().gasReportSubmit16Checkpoints(_getGasReportSubmission(16));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
  }

  function testGasReportSubmit32Checkpoints() public {
    _gasReporter().gasReportSubmit32Checkpoints(_getGasReportSubmission(32));
    assertEq(rollup.getProvenCheckpointNumber(), 32);
  }
}

abstract contract PartialEpochProofCalculatorBase is PartialEpochProofGasReportBase {
  function _setCalculator(address _calculator) internal {
    vm.prank(rollup.owner());
    rollup.setSequencerRewardCalculator(_calculator);
  }

  function _defaultReward() internal view returns (uint256) {
    RewardConfig memory config = rollup.getRewardConfig();
    return BpsLib.mul(config.checkpointReward, config.sequencerBps);
  }

  /// @dev The proposer of each checkpoint, which the fixture also uses as its coinbase.
  function _checkpointProposers(uint256 _length) internal view returns (address[] memory proposers) {
    proposers = new address[](_length);
    for (uint256 i = 0; i < _length; i++) {
      proposers[i] = checkpointHeaders[i + 1].coinbase;
    }
  }

  function _sequencerRewards(address[] memory _proposers) internal view returns (uint256[] memory rewards) {
    rewards = new uint256[](_proposers.length);
    for (uint256 i = 0; i < _proposers.length; i++) {
      rewards[i] = rollup.getSequencerRewards(_proposers[i]);
    }
  }

  /// @dev Sequencer rewards of `_proposers` after submitting `_length` checkpoints without a calculator, from the
  ///      given snapshot. Leaves the state at that snapshot.
  function _sequencerRewardsWithoutCalculator(uint256 _snapshot, uint256 _length, address[] memory _proposers)
    internal
    returns (uint256[] memory rewards)
  {
    vm.revertToState(_snapshot);
    _setCalculator(address(0));
    rollup.submitEpochRootProof(_getGasReportSubmission(_length));
    rewards = _sequencerRewards(_proposers);
    vm.revertToState(_snapshot);
  }

  /// @dev Asserts that each proposer received, over the default, the sum of what `_reward` returns for its
  ///      checkpoints minus the default.
  function _assertPremiums(
    address[] memory _proposers,
    uint256[] memory _with,
    uint256[] memory _without,
    function(address) internal view returns (uint256) _reward
  ) internal view {
    uint256 defaultReward = _defaultReward();
    for (uint256 i = 0; i < _proposers.length; i++) {
      uint256 expected = _without[i];
      for (uint256 j = 0; j < _proposers.length; j++) {
        if (_proposers[j] == _proposers[i]) {
          expected = expected + _reward(_proposers[j]) - defaultReward;
        }
      }
      assertEq(_with[i], expected, "sequencer rewards");
    }
  }
}

/**
 * @notice Deploys the fixture rollup's asset and GSE before the rollup, so that premium factories, which are bound to
 *         one GSE and only accepted by calculators on it, can create the fixture validators' positions first.
 */
abstract contract PremiumCalculatorGasReportBase is PartialEpochProofCalculatorBase {
  TestERC20 internal fixtureAsset;
  GSEWithSkip internal fixtureGse;

  function _deployFixtureGSE() internal returns (IGSE) {
    fixtureAsset = new TestERC20("test", "TEST", address(this));
    // The coin issuer needs some supply, as the builder's own asset has.
    fixtureAsset.mint(address(this), 1e18);
    fixtureGse = new GSEWithSkip(
      address(this), fixtureAsset, TestConstants.ACTIVATION_THRESHOLD, TestConstants.EJECTION_THRESHOLD
    );
    fixtureGse.setCheckProofOfPossession(false);
    return IGSE(address(fixtureGse));
  }

  function _configureRollupBuilder(RollupBuilder _builder) internal virtual override {
    fixtureAsset.addMinter(address(_builder));
    _builder.setTestERC20(fixtureAsset).setGSE(fixtureGse);
  }
}

/**
 * @notice Gas of partial epoch proofs with a table-lookup sequencer reward calculator, one storage read per proposer.
 */
contract PartialEpochProofWithCalculatorGasReportTest is PartialEpochProofCalculatorBase {
  TableCalculator internal calculator;

  function setUp() public override {
    super.setUp();
    calculator = new TableCalculator();
    uint256 defaultReward = _defaultReward();
    // A quarter of the validators earn a premium, a quarter half the default and a quarter a quarter of it. No reward
    // is zero, so every checkpoint writes its coinbase balance as without a calculator, and the difference to the
    // rows without a calculator is the cost of the calculator path.
    for (uint256 i = 1; i <= 48; i++) {
      address attester = vm.addr(uint256(keccak256(abi.encode("attester", i))));
      if (i % 4 == 0) {
        calculator.setReward(attester, 2 * defaultReward);
      } else if (i % 4 == 1) {
        calculator.setReward(attester, defaultReward / 2);
      } else if (i % 4 == 2) {
        calculator.setReward(attester, defaultReward / 4);
      }
    }
    _setCalculator(address(calculator));
  }

  function testGasReportSubmit1CheckpointWithCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit1CheckpointWithCalculator(_getGasReportSubmission(1));
    _assertCalculatorRewards(snapshot, 1);
  }

  function testGasReportSubmit8CheckpointsWithCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit8CheckpointsWithCalculator(_getGasReportSubmission(8));
    _assertCalculatorRewards(snapshot, 8);
  }

  function testGasReportSubmit16CheckpointsWithCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit16CheckpointsWithCalculator(_getGasReportSubmission(16));
    _assertCalculatorRewards(snapshot, 16);
  }

  function testGasReportSubmit32CheckpointsWithCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit32CheckpointsWithCalculator(_getGasReportSubmission(32));
    _assertCalculatorRewards(snapshot, 32);
  }

  function testCalculatorReceivesTheProposerOfEveryCheckpoint() public {
    address[] memory proposers = _checkpointProposers(32);
    vm.expectCall(
      address(calculator),
      abi.encodeCall(
        ISequencerRewardCalculator.getSequencerRewards,
        (Epoch.wrap(GAS_REPORT_EPOCH), proposers, _defaultReward(), rollup.getCheckpointReward())
      ),
      1
    );
    rollup.submitEpochRootProof(_getGasReportSubmission(32));
  }

  function testCompactExtensionWithCalculatorPreservesRewards() public {
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    uint256 snapshot = vm.snapshotState();
    rollup.submitEpochRootProof(_getGasReportSubmission(16));
    uint256 rewards = rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(GAS_REPORT_EPOCH));
    uint256[] memory sequencerRewards = _sequencerRewards(_checkpointProposers(16));
    vm.revertToState(snapshot);
    rollup.submitEpochRootProof(_compactSubmission(_getGasReportSubmission(16), 8));
    assertEq(rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(GAS_REPORT_EPOCH)), rewards);
    assertEq(_sequencerRewards(_checkpointProposers(16)), sequencerRewards);
  }

  function _assertCalculatorRewards(uint256 _snapshot, uint256 _length) internal {
    assertEq(rollup.getProvenCheckpointNumber(), _length);
    address[] memory proposers = _checkpointProposers(_length);
    uint256[] memory withCalculator = _sequencerRewards(proposers);
    uint256[] memory withoutCalculator = _sequencerRewardsWithoutCalculator(_snapshot, _length, proposers);
    _assertPremiums(proposers, withCalculator, withoutCalculator, _tableReward);
  }

  function _tableReward(address _proposer) internal view returns (uint256) {
    (bool exists, uint256 reward) = calculator.entries(_proposer);
    return exists ? reward : _defaultReward();
  }
}

/**
 * @notice Through the rollup, the calculator runs with exactly the stipend, and a calculator that burns all of it
 *         falls back to the default without failing a proof that was given enough gas.
 */
contract PartialEpochProofCalculatorStipendTest is PartialEpochProofCalculatorBase {
  uint256 internal observedGas;

  function testCalculatorRunsWithTheStipend1Checkpoint() public {
    _assertStipend(1);
  }

  function testCalculatorRunsWithTheStipend8Checkpoints() public {
    _assertStipend(8);
  }

  function testCalculatorRunsWithTheStipend16Checkpoints() public {
    _assertStipend(16);
  }

  function testCalculatorRunsWithTheStipend32Checkpoints() public {
    _assertStipend(32);
  }

  // Isolation runs every external call as its own transaction, so both submissions below start cold, as a real one.
  /// forge-config: default.isolate = true
  function testGasBurningCalculatorWithEnoughGas1Checkpoint() public {
    _assertGasBurningCalculator(1);
  }

  /// forge-config: default.isolate = true
  function testGasBurningCalculatorWithEnoughGas32Checkpoints() public {
    _assertGasBurningCalculator(32);
  }

  /// forge-config: default.isolate = true
  function testSmallestSufficientGasRunsTheCalculatorWithTheStipend1Checkpoint() public {
    _assertSmallestSufficientGas(1);
  }

  /// forge-config: default.isolate = true
  function testSmallestSufficientGasRunsTheCalculatorWithTheStipend32Checkpoints() public {
    _assertSmallestSufficientGas(32);
  }

  function _assertStipend(uint256 _length) internal {
    uint256 snapshot = vm.snapshotState();
    _setCalculator(address(new GasReportingCalculator()));
    rollup.submitEpochRootProof(_getGasReportSubmission(_length));

    address[] memory proposers = _checkpointProposers(_length);
    uint256[] memory withCalculator = _sequencerRewards(proposers);
    uint256[] memory withoutCalculator = _sequencerRewardsWithoutCalculator(snapshot, _length, proposers);

    // Every checkpoint was paid the gas the calculator saw on entry: recover it from the first proposer, whose
    // balance without a calculator is its sequencer fees plus one default per checkpoint.
    uint256 count = 0;
    for (uint256 i = 0; i < _length; i++) {
      if (proposers[i] == proposers[0]) {
        count++;
      }
    }
    uint256 fees = withoutCalculator[0] - count * _defaultReward();
    observedGas = (withCalculator[0] - fees) / count;
    _assertPremiums(proposers, withCalculator, withoutCalculator, _observedGas);

    uint256 stipend = CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * _length;
    assertLe(observedGas, stipend, "above the stipend");
    // A bare fallback reads `gas()` a handful of opcodes after the call starts.
    assertGe(observedGas, stipend - 100, "below the stipend");
  }

  function _assertGasBurningCalculator(uint256 _length) internal {
    address[] memory proposers = _checkpointProposers(_length);
    SubmitEpochRootProofArgs memory submission = _getGasReportSubmission(_length);
    uint256 snapshot = vm.snapshotState();

    // Gas and rewards of the same proof without a calculator. The proposers' reward balances start at zero, so the
    // writes after the calculator call are fresh storage writes.
    for (uint256 i = 0; i < _length; i++) {
      assertEq(rollup.getSequencerRewards(proposers[i]), 0);
    }
    _setCalculator(address(0));
    uint256 gasWithoutCalculator = this.submitAndMeasure(submission);
    uint256[] memory withoutCalculator = _sequencerRewards(proposers);
    vm.revertToState(snapshot);

    // The calculator burns its whole stipend. The proof still lands given the cost of the proof without a calculator,
    // the gas the rollup must be able to forward, and the proposer derivation; every checkpoint receives the default.
    // The rollup delegates the proof to an external library and EIP-150 keeps back 1/64 of the gas it forwards, so
    // the limit also grows by 1/63 of the proof's own cost, which EIP-8037 raises by repricing its fresh storage slots.
    uint256 stipend = CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * _length;
    uint256 required = (stipend * 64) / 63 + 1 + CALCULATOR_CALL_GAS_RESERVE;
    _setCalculator(address(new GasBurningCalculator()));
    uint256 smallest = _smallestSufficientGas(submission);
    emit log_named_uint(
      "gas above the proof without a calculator, beyond the stipend", smallest - gasWithoutCalculator - stipend
    );
    assertLe(smallest, (gasWithoutCalculator * 64) / 63 + required + 10_000, "needs more than the stipend bound");

    this.submitWithGas(submission, smallest);
    assertEq(rollup.getProvenCheckpointNumber(), _length);
    assertEq(_sequencerRewards(proposers), withoutCalculator, "defaults not paid");
  }

  function _assertSmallestSufficientGas(uint256 _length) internal {
    SubmitEpochRootProofArgs memory submission = _getGasReportSubmission(_length);
    address proposer = _checkpointProposers(_length)[0];
    _setCalculator(address(new GasReportingCalculator()));

    uint256 snapshot = vm.snapshotState();
    rollup.submitEpochRootProof(submission);
    uint256 full = rollup.getSequencerRewards(proposer);
    vm.revertToState(snapshot);

    // Any less gas and the submission reverts, with SequencerRewardCalculatorLib__InsufficientGas or out of gas; it
    // never lands having given the calculator less than the stipend.
    this.submitWithGas(submission, _smallestSufficientGas(submission));
    assertEq(rollup.getSequencerRewards(proposer), full, "the calculator ran with less than the stipend");
  }

  /// @dev Binary searches the smallest gas limit with which `_submission` lands. Leaves the state unchanged.
  function _smallestSufficientGas(SubmitEpochRootProofArgs memory _submission) internal returns (uint256 low) {
    uint256 snapshot = vm.snapshotState();
    uint256 high = 10_000_000;
    while (low < high) {
      uint256 mid = (low + high) / 2;
      try this.submitWithGas(_submission, mid) {
        high = mid;
      } catch {
        low = mid + 1;
      }
      vm.revertToState(snapshot);
    }
  }

  /// @dev Submissions go through these so that, under isolation, each one is its own transaction with a cold rollup
  ///      and the gas limit applies to the rollup call alone.
  function submitWithGas(SubmitEpochRootProofArgs memory _args, uint256 _gas) external {
    rollup.submitEpochRootProof{gas: _gas}(_args);
  }

  function submitAndMeasure(SubmitEpochRootProofArgs memory _args) external returns (uint256) {
    uint256 gasBefore = gasleft();
    rollup.submitEpochRootProof(_args);
    return gasBefore - gasleft();
  }

  function _observedGas(address) internal view returns (uint256) {
    return observedGas;
  }
}

contract PartialEpochProofExtensionGasReportTest is PartialEpochProofGasReportBase {
  function setUp() public override {
    super.setUp();
    rollup.submitEpochRootProof(_getGasReportSubmission(8));
    assertEq(rollup.getProvenCheckpointNumber(), 8);
  }

  function testGasReportSubmit8MoreCheckpoints() public {
    _gasReporter().gasReportSubmit8MoreCheckpoints(_compactSubmission(_getGasReportSubmission(16), 8));
    assertEq(rollup.getProvenCheckpointNumber(), 16);
  }
}

/**
 * @notice Gas of partial epoch proofs with the reference registry reduction calculator. Every validator is staked
 *         through its own mainnet-shaped position (ERC1967 proxy staker, EIP-1167 clone ATP) of one of three
 *         registries: one pays half the default, one a quarter of it, and one has no entry and pays the default.
 */
contract PartialEpochProofWithReductionCalculatorGasReportTest is PartialEpochProofCalculatorBase {
  uint256 internal constant VALIDATOR_COUNT = 48;

  address internal halfRegistry = makeAddr("half registry");
  address internal quarterRegistry = makeAddr("quarter registry");
  address internal unlistedRegistry = makeAddr("unlisted registry");

  RegistryReductionCalculator internal reductionCalculator;
  address[] internal validatorStakers;
  mapping(address attester => address registry) internal registryOf;
  mapping(address attester => uint256 index) internal validatorIndexOf;

  function setUp() public override {
    MockATP[3] memory atpImplementations =
      [new MockATP(halfRegistry), new MockATP(quarterRegistry), new MockATP(unlistedRegistry)];
    address stakerImplementation = address(new MockATPStakerImplementation());
    for (uint256 i = 0; i < VALIDATOR_COUNT; i++) {
      (address staker,) = deployMainnetShapedATPStaker(atpImplementations[i % 3], stakerImplementation);
      validatorStakers.push(staker);
      address attester = vm.addr(uint256(keccak256(abi.encode("attester", i + 1))));
      registryOf[attester] = [halfRegistry, quarterRegistry, unlistedRegistry][i % 3];
      validatorIndexOf[attester] = i;
    }

    super.setUp();

    reductionCalculator = new RegistryReductionCalculator(IGSE(address(rollup.getGSE())), address(this));
    // No reward is zero, so every checkpoint writes its coinbase balance as without a calculator.
    uint256 defaultReward = _defaultReward();
    reductionCalculator.setRegistryReward(halfRegistry, SafeCast.toUint96(defaultReward / 2));
    reductionCalculator.setRegistryReward(quarterRegistry, SafeCast.toUint96(defaultReward / 4));
    _setCalculator(address(reductionCalculator));
  }

  function testGasReportSubmit1CheckpointWithReductionCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit1CheckpointWithReductionCalculator(_getGasReportSubmission(1));
    _assertReducedRewards(snapshot, 1);
  }

  function testGasReportSubmit8CheckpointsWithReductionCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit8CheckpointsWithReductionCalculator(_getGasReportSubmission(8));
    _assertReducedRewards(snapshot, 8);
  }

  function testGasReportSubmit16CheckpointsWithReductionCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit16CheckpointsWithReductionCalculator(_getGasReportSubmission(16));
    _assertReducedRewards(snapshot, 16);
  }

  function testGasReportSubmit32CheckpointsWithReductionCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit32CheckpointsWithReductionCalculator(_getGasReportSubmission(32));
    _assertReducedRewards(snapshot, 32);
  }

  function testValidatorsResolveToTheirRegistries() public view {
    address[] memory proposers = _checkpointProposers(32);
    uint256 halfCount = 0;
    uint256 quarterCount = 0;
    for (uint256 i = 0; i < proposers.length; i++) {
      assertEq(rollup.getGSE().getWithdrawer(proposers[i]), validatorStakers[_validatorIndex(proposers[i])]);
      (bool resolved, address registry) = reductionCalculator.resolveRegistry(proposers[i]);
      assertTrue(resolved);
      assertEq(registry, registryOf[proposers[i]]);
      halfCount += registry == halfRegistry ? 1 : 0;
      quarterCount += registry == quarterRegistry ? 1 : 0;
    }
    // The fixture's proposers cover every kind of validator, so the reward assertions are not vacuous.
    assertGt(halfCount, 0);
    assertGt(quarterCount, 0);
    assertGt(proposers.length - halfCount - quarterCount, 0);
  }

  function _validatorWithdrawer(uint256 _index) internal view override returns (address) {
    return validatorStakers[_index];
  }

  function _assertReducedRewards(uint256 _snapshot, uint256 _length) internal {
    assertEq(rollup.getProvenCheckpointNumber(), _length);
    address[] memory proposers = _checkpointProposers(_length);
    uint256[] memory withCalculator = _sequencerRewards(proposers);
    uint256[] memory withoutCalculator = _sequencerRewardsWithoutCalculator(_snapshot, _length, proposers);
    _assertPremiums(proposers, withCalculator, withoutCalculator, _reducedReward);
  }

  function _validatorIndex(address _attester) internal view returns (uint256) {
    assertTrue(registryOf[_attester] != address(0), "not a validator");
    return validatorIndexOf[_attester];
  }

  function _reducedReward(address _proposer) internal view returns (uint256) {
    address registry = registryOf[_proposer];
    assertTrue(registry != address(0), "not a validator");
    uint256 defaultReward = _defaultReward();
    if (registry == halfRegistry) {
      return defaultReward / 2;
    }
    if (registry == quarterRegistry) {
      return defaultReward / 4;
    }
    return defaultReward;
  }
}

/**
 * @notice Gas of partial epoch proofs with the registry reduction calculator in the scenario of the removed in-rollup
 *         registry reward overrides bench: two shared mock ATP stakers, each pointing at a mock ATP of its own
 *         registry, configured at 10e18 and 20e18. Validators alternate between the two stakers by index, so every
 *         proposer is matched and, after the first lookup through each staker, the staker and ATP reads are warm.
 */
contract PartialEpochProofWithReductionCalculatorTwoMockStakersGasReportTest is PartialEpochProofCalculatorBase {
  uint256 internal constant VALIDATOR_COUNT = 48;
  uint96 internal constant FIRST_REWARD = 10e18;
  uint96 internal constant SECOND_REWARD = 20e18;

  address internal firstRegistry = makeAddr("firstRegistry");
  address internal secondRegistry = makeAddr("secondRegistry");
  MockATPStaker internal firstStaker;
  MockATPStaker internal secondStaker;

  RegistryReductionCalculator internal reductionCalculator;
  mapping(address attester => address registry) internal registryOf;

  function setUp() public override {
    (firstStaker,) = deployMockATPStaker(firstRegistry);
    (secondStaker,) = deployMockATPStaker(secondRegistry);
    for (uint256 i = 0; i < VALIDATOR_COUNT; i++) {
      address attester = vm.addr(uint256(keccak256(abi.encode("attester", i + 1))));
      registryOf[attester] = i % 2 == 0 ? firstRegistry : secondRegistry;
    }

    super.setUp();

    reductionCalculator = new RegistryReductionCalculator(IGSE(address(rollup.getGSE())), address(this));
    reductionCalculator.setRegistryReward(firstRegistry, FIRST_REWARD);
    reductionCalculator.setRegistryReward(secondRegistry, SECOND_REWARD);
    _setCalculator(address(reductionCalculator));
  }

  function testGasReportSubmit1CheckpointWithReductionCalculatorTwoMockStakers() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit1CheckpointWithReductionCalculatorTwoMockStakers(_getGasReportSubmission(1));
    _assertReducedRewards(snapshot, 1);
  }

  function testGasReportSubmit8CheckpointsWithReductionCalculatorTwoMockStakers() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit8CheckpointsWithReductionCalculatorTwoMockStakers(_getGasReportSubmission(8));
    _assertReducedRewards(snapshot, 8);
  }

  function testGasReportSubmit16CheckpointsWithReductionCalculatorTwoMockStakers() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit16CheckpointsWithReductionCalculatorTwoMockStakers(_getGasReportSubmission(16));
    _assertReducedRewards(snapshot, 16);
  }

  function testGasReportSubmit32CheckpointsWithReductionCalculatorTwoMockStakers() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit32CheckpointsWithReductionCalculatorTwoMockStakers(_getGasReportSubmission(32));
    _assertReducedRewards(snapshot, 32);
  }

  function testEveryProposerResolvesToOneOfTheTwoRegistries() public view {
    assertLt(SECOND_REWARD, _defaultReward(), "rewards are reductions");
    address[] memory proposers = _checkpointProposers(32);
    uint256 firstCount = 0;
    for (uint256 i = 0; i < proposers.length; i++) {
      address registry = registryOf[proposers[i]];
      assertTrue(registry != address(0), "not a validator");
      assertEq(
        rollup.getGSE().getWithdrawer(proposers[i]),
        registry == firstRegistry ? address(firstStaker) : address(secondStaker)
      );
      (bool resolved, address resolvedRegistry) = reductionCalculator.resolveRegistry(proposers[i]);
      assertTrue(resolved);
      assertEq(resolvedRegistry, registry);
      firstCount += registry == firstRegistry ? 1 : 0;
    }
    // The fixture's proposers cover both registries, so the reward assertions are not vacuous.
    assertGt(firstCount, 0);
    assertGt(proposers.length - firstCount, 0);
  }

  function _validatorWithdrawer(uint256 _index) internal view override returns (address) {
    return _index % 2 == 0 ? address(firstStaker) : address(secondStaker);
  }

  function _assertReducedRewards(uint256 _snapshot, uint256 _length) internal {
    assertEq(rollup.getProvenCheckpointNumber(), _length);
    address[] memory proposers = _checkpointProposers(_length);
    uint256[] memory withCalculator = _sequencerRewards(proposers);
    uint256[] memory withoutCalculator = _sequencerRewardsWithoutCalculator(_snapshot, _length, proposers);
    _assertPremiums(proposers, withCalculator, withoutCalculator, _reducedReward);
  }

  function _reducedReward(address _proposer) internal view returns (uint256) {
    address registry = registryOf[_proposer];
    assertTrue(registry != address(0), "not a validator");
    return registry == firstRegistry ? FIRST_REWARD : SECOND_REWARD;
  }
}

/**
 * @notice Gas of partial epoch proofs with the premium calculator, and its rewards under a distributor shortfall.
 * @dev A third of the validators are staked from genuine premium positions (five probes each), a third from genuine
 *      positions of a registry with a reduction and no provenance source (two probes), and a third name a fake
 *      withdrawer that points at a genuine premium position (four probes, rejected by the reverse staker check).
 *      Every validator has its own position, so no proposer's lookups are warm from another's. The positions record
 *      their attesters through the genuine staker, against a rollup stand-in: the fixture's validators are added
 *      with cheat deposits before any position could stake through the fixture's rollup.
 */
contract PartialEpochProofWithPremiumCalculatorGasReportTest is PremiumCalculatorGasReportBase {
  enum Kind {
    Premium,
    Reduced,
    Forged
  }

  uint256 internal constant VALIDATOR_COUNT = 48;
  uint256 internal constant POSITION_THRESHOLD = 100e18;

  PremiumATPRegistry internal premiumRegistry;
  PremiumATPRegistry internal reducedRegistry;
  PremiumATPFactory internal premiumFactory;
  PremiumATPFactory internal reducedFactory;
  PremiumRewardCalculator internal premiumCalculator;
  address[] internal premiumWithdrawers;
  mapping(address attester => Kind kind) internal kindOf;
  mapping(address attester => bool validator) internal isPremiumFixtureValidator;

  function setUp() public override {
    IGSE gse = _deployFixtureGSE();
    TestERC20 positionToken = new TestERC20("position", "POS", address(this));
    MockStakingRollup stakingRollup = new MockStakingRollup(positionToken, POSITION_THRESHOLD, address(gse));
    IRegistry positionRollupRegistry = IRegistry(address(new MockRollupRegistry(stakingRollup)));
    UnlockSchedule memory schedule = UnlockSchedule({startTime: 0, cliffDuration: 0, lockDuration: 1});
    premiumRegistry = new PremiumATPRegistry(address(this), schedule);
    reducedRegistry = new PremiumATPRegistry(address(this), schedule);
    premiumFactory = new PremiumATPFactory(
      address(this), positionToken, premiumRegistry, positionRollupRegistry, gse, IStakingRegistry(address(0))
    );
    reducedFactory = new PremiumATPFactory(
      address(this), positionToken, reducedRegistry, positionRollupRegistry, gse, IStakingRegistry(address(0))
    );
    positionToken.mint(address(premiumFactory), VALIDATOR_COUNT * POSITION_THRESHOLD);
    positionToken.mint(address(reducedFactory), VALIDATOR_COUNT * POSITION_THRESHOLD);

    for (uint256 i = 0; i < VALIDATOR_COUNT; i++) {
      address attester = vm.addr(uint256(keccak256(abi.encode("attester", i + 1))));
      Kind kind = Kind(i % 3);
      kindOf[attester] = kind;
      isPremiumFixtureValidator[attester] = true;
      PremiumATP atp =
        (kind == Kind.Reduced ? reducedFactory : premiumFactory).createATP(address(this), POSITION_THRESHOLD);
      if (kind == Kind.Forged) {
        premiumWithdrawers.push(address(new FakeWithdrawer(address(atp))));
        continue;
      }
      atp.updateStakerOperator(address(this));
      PremiumATPStaker staker = PremiumATPStaker(atp.getStaker());
      staker.stake(1, attester, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
      premiumWithdrawers.push(address(staker));
    }

    super.setUp();

    premiumCalculator = new PremiumRewardCalculator(IGSE(address(rollup.getGSE())), address(this));
    // No reward is zero, so every checkpoint writes its coinbase balance as without a calculator.
    uint256 defaultReward = _defaultReward();
    premiumCalculator.setRegistryReward(
      address(premiumRegistry), SafeCast.toUint96(2 * defaultReward), address(premiumFactory)
    );
    premiumCalculator.setRegistryReward(address(reducedRegistry), SafeCast.toUint96(defaultReward / 2), address(0));
    _setCalculator(address(premiumCalculator));
  }

  function testGasReportSubmit1CheckpointWithPremiumCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit1CheckpointWithPremiumCalculator(_getGasReportSubmission(1));
    _assertPremiumRewards(snapshot, 1);
  }

  function testGasReportSubmit8CheckpointsWithPremiumCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit8CheckpointsWithPremiumCalculator(_getGasReportSubmission(8));
    _assertPremiumRewards(snapshot, 8);
  }

  function testGasReportSubmit16CheckpointsWithPremiumCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit16CheckpointsWithPremiumCalculator(_getGasReportSubmission(16));
    _assertPremiumRewards(snapshot, 16);
  }

  function testGasReportSubmit32CheckpointsWithPremiumCalculator() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit32CheckpointsWithPremiumCalculator(_getGasReportSubmission(32));
    _assertPremiumRewards(snapshot, 32);
  }

  function testProposersCoverEveryKindOfValidator() public view {
    address[] memory proposers = _checkpointProposers(32);
    uint256[3] memory counts;
    for (uint256 i = 0; i < proposers.length; i++) {
      Kind kind = _kindOf(proposers[i]);
      counts[uint256(kind)]++;
      address withdrawer = rollup.getGSE().getWithdrawer(proposers[i]);
      if (kind != Kind.Forged) {
        assertTrue(PremiumATPStaker(withdrawer).isAttester(proposers[i]));
      }
    }
    // The reward assertions are not vacuous: a calculator that ran out of stipend would pay the default to all.
    assertGt(counts[uint256(Kind.Premium)], 0);
    assertGt(counts[uint256(Kind.Reduced)], 0);
    assertGt(counts[uint256(Kind.Forged)], 0);
  }

  /// @dev Under a shortfall, premiums are scaled like every other sequencer reward, `available / desired`, and the
  ///      prover pool receives the remainder of what was claimed.
  function testShortfallScalesPremiumsProportionally() public {
    uint256 n = 32;
    address[] memory proposers = _checkpointProposers(n);
    uint256 proverShare = n * (rollup.getCheckpointReward() - _defaultReward());
    uint256[] memory rewards = new uint256[](n);
    uint256 desired = proverShare;
    for (uint256 i = 0; i < n; i++) {
      rewards[i] = _premiumReward(proposers[i]);
      desired += rewards[i];
    }

    // Without a shortfall: the fee parts of every balance, which the shortfall does not scale.
    uint256 snapshot = vm.snapshotState();
    rollup.submitEpochRootProof(_getGasReportSubmission(n));
    uint256 proverFees = rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(GAS_REPORT_EPOCH)) - proverShare;
    uint256[] memory full = _sequencerRewards(proposers);
    vm.revertToState(snapshot);

    IRewardDistributor distributor = rollup.getRewardDistributor();
    uint256 available = desired / 3;
    deal(address(asset), address(distributor), available);
    assertEq(distributor.availableTo(address(rollup)), available);

    rollup.submitEpochRootProof(_getGasReportSubmission(n));

    uint256 scaledTotal = _assertScaledSequencerRewards(proposers, rewards, full, available, desired);
    assertEq(
      rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(GAS_REPORT_EPOCH)),
      available - scaledTotal + proverFees,
      "prover rewards"
    );
    assertEq(asset.balanceOf(address(distributor)), 0, "the distributor kept tokens");
  }

  /// @dev Asserts every coinbase received its fee part plus `mulDiv(reward, available, desired)` per checkpoint it
  ///      proposed, and returns the sum of the scaled rewards.
  function _assertScaledSequencerRewards(
    address[] memory _proposers,
    uint256[] memory _rewards,
    uint256[] memory _full,
    uint256 _available,
    uint256 _desired
  ) internal view returns (uint256 scaledTotal) {
    uint256 n = _proposers.length;
    uint256[] memory scaled = new uint256[](n);
    bool premiumSeen = false;
    for (uint256 i = 0; i < n; i++) {
      scaled[i] = Math.mulDiv(_rewards[i], _available, _desired);
      scaledTotal += scaled[i];
      premiumSeen = premiumSeen || _rewards[i] > _defaultReward();
    }
    assertTrue(premiumSeen, "no premium in the epoch");
    uint256[] memory actual = _sequencerRewards(_proposers);
    for (uint256 i = 0; i < n; i++) {
      uint256 expected = _full[i];
      for (uint256 j = 0; j < n; j++) {
        if (_proposers[j] == _proposers[i]) {
          expected = expected - _rewards[j] + scaled[j];
        }
      }
      assertEq(actual[i], expected, "scaled sequencer rewards");
    }
  }

  function _validatorWithdrawer(uint256 _index) internal view override returns (address) {
    return premiumWithdrawers[_index];
  }

  function _assertPremiumRewards(uint256 _snapshot, uint256 _length) internal {
    assertEq(rollup.getProvenCheckpointNumber(), _length);
    address[] memory proposers = _checkpointProposers(_length);
    uint256[] memory withCalculator = _sequencerRewards(proposers);
    uint256[] memory withoutCalculator = _sequencerRewardsWithoutCalculator(_snapshot, _length, proposers);
    _assertPremiums(proposers, withCalculator, withoutCalculator, _premiumReward);
  }

  function _kindOf(address _attester) internal view returns (Kind) {
    assertTrue(isPremiumFixtureValidator[_attester], "not a validator");
    return kindOf[_attester];
  }

  function _premiumReward(address _proposer) internal view returns (uint256) {
    Kind kind = _kindOf(_proposer);
    uint256 defaultReward = _defaultReward();
    if (kind == Kind.Premium) {
      return 2 * defaultReward;
    }
    if (kind == Kind.Reduced) {
      return defaultReward / 2;
    }
    return defaultReward;
  }
}

/**
 * @notice Gas of partial epoch proofs with the premium calculator in the scenario of the removed in-rollup registry
 *         reward overrides bench: two shared genuine premium positions, each of its own premium registry and factory.
 *         Validators alternate between the two positions' stakers by index, and each staker records every attester
 *         it is the withdrawer of, so every proposer is authenticated and earns its registry's premium. After the
 *         first lookup through each position, every read but the per-attester `isAttester` record is warm. The
 *         positions record their attesters against a rollup stand-in, as in the per-validator premium bench.
 * @dev The overrides bench configured 10e18 and 20e18, below the default; a premium calculator pays such entries
 *      without authentication, so this bench configures premiums above the default instead to run every probe.
 */
contract PartialEpochProofWithPremiumCalculatorTwoPremiumStakersGasReportTest is PremiumCalculatorGasReportBase {
  uint256 internal constant VALIDATOR_COUNT = 48;
  uint256 internal constant POSITION_THRESHOLD = 100e18;
  uint96 internal constant FIRST_REWARD = 30e18;
  uint96 internal constant SECOND_REWARD = 40e18;

  PremiumATPRegistry internal firstRegistry;
  PremiumATPRegistry internal secondRegistry;
  PremiumATPFactory internal firstFactory;
  PremiumATPFactory internal secondFactory;
  PremiumATPStaker internal firstStaker;
  PremiumATPStaker internal secondStaker;
  PremiumRewardCalculator internal premiumCalculator;
  mapping(address attester => address registry) internal registryOf;

  function setUp() public override {
    IGSE gse = _deployFixtureGSE();
    TestERC20 positionToken = new TestERC20("position", "POS", address(this));
    MockStakingRollup stakingRollup = new MockStakingRollup(positionToken, POSITION_THRESHOLD, address(gse));
    IRegistry positionRollupRegistry = IRegistry(address(new MockRollupRegistry(stakingRollup)));
    UnlockSchedule memory schedule = UnlockSchedule({startTime: 0, cliffDuration: 0, lockDuration: 1});
    firstRegistry = new PremiumATPRegistry(address(this), schedule);
    secondRegistry = new PremiumATPRegistry(address(this), schedule);
    firstFactory = new PremiumATPFactory(
      address(this), positionToken, firstRegistry, positionRollupRegistry, gse, IStakingRegistry(address(0))
    );
    secondFactory = new PremiumATPFactory(
      address(this), positionToken, secondRegistry, positionRollupRegistry, gse, IStakingRegistry(address(0))
    );
    firstStaker = _createPosition(positionToken, firstFactory);
    secondStaker = _createPosition(positionToken, secondFactory);

    for (uint256 i = 0; i < VALIDATOR_COUNT; i++) {
      address attester = vm.addr(uint256(keccak256(abi.encode("attester", i + 1))));
      registryOf[attester] = i % 2 == 0 ? address(firstRegistry) : address(secondRegistry);
      PremiumATPStaker(_validatorWithdrawer(i))
        .stake(1, attester, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
    }

    super.setUp();

    premiumCalculator = new PremiumRewardCalculator(IGSE(address(rollup.getGSE())), address(this));
    premiumCalculator.setRegistryReward(address(firstRegistry), FIRST_REWARD, address(firstFactory));
    premiumCalculator.setRegistryReward(address(secondRegistry), SECOND_REWARD, address(secondFactory));
    _setCalculator(address(premiumCalculator));
  }

  function testGasReportSubmit1CheckpointWithPremiumCalculatorTwoPremiumStakers() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit1CheckpointWithPremiumCalculatorTwoPremiumStakers(_getGasReportSubmission(1));
    _assertPremiumRewards(snapshot, 1);
  }

  function testGasReportSubmit8CheckpointsWithPremiumCalculatorTwoPremiumStakers() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit8CheckpointsWithPremiumCalculatorTwoPremiumStakers(_getGasReportSubmission(8));
    _assertPremiumRewards(snapshot, 8);
  }

  function testGasReportSubmit16CheckpointsWithPremiumCalculatorTwoPremiumStakers() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit16CheckpointsWithPremiumCalculatorTwoPremiumStakers(_getGasReportSubmission(16));
    _assertPremiumRewards(snapshot, 16);
  }

  function testGasReportSubmit32CheckpointsWithPremiumCalculatorTwoPremiumStakers() public {
    uint256 snapshot = vm.snapshotState();
    _gasReporter().gasReportSubmit32CheckpointsWithPremiumCalculatorTwoPremiumStakers(_getGasReportSubmission(32));
    _assertPremiumRewards(snapshot, 32);
  }

  function testEveryProposerIsAuthenticatedThroughOneOfTheTwoStakers() public view {
    assertGt(FIRST_REWARD, _defaultReward(), "rewards are premiums");
    address[] memory proposers = _checkpointProposers(32);
    uint256 firstCount = 0;
    for (uint256 i = 0; i < proposers.length; i++) {
      address registry = registryOf[proposers[i]];
      assertTrue(registry != address(0), "not a validator");
      bool first = registry == address(firstRegistry);
      PremiumATPStaker staker = first ? firstStaker : secondStaker;
      assertEq(rollup.getGSE().getWithdrawer(proposers[i]), address(staker));
      assertTrue(
        premiumCalculator.isAuthenticated(
          proposers[i], address(staker), staker.getATP(), address(first ? firstFactory : secondFactory)
        )
      );
      firstCount += first ? 1 : 0;
    }
    // The fixture's proposers cover both positions, so the reward assertions are not vacuous.
    assertGt(firstCount, 0);
    assertGt(proposers.length - firstCount, 0);
  }

  function _createPosition(TestERC20 _token, PremiumATPFactory _factory) internal returns (PremiumATPStaker) {
    uint256 allocation = VALIDATOR_COUNT / 2 * POSITION_THRESHOLD;
    _token.mint(address(_factory), allocation);
    PremiumATP atp = _factory.createATP(address(this), allocation);
    atp.updateStakerOperator(address(this));
    return PremiumATPStaker(atp.getStaker());
  }

  function _validatorWithdrawer(uint256 _index) internal view override returns (address) {
    return _index % 2 == 0 ? address(firstStaker) : address(secondStaker);
  }

  function _assertPremiumRewards(uint256 _snapshot, uint256 _length) internal {
    assertEq(rollup.getProvenCheckpointNumber(), _length);
    address[] memory proposers = _checkpointProposers(_length);
    uint256[] memory withCalculator = _sequencerRewards(proposers);
    uint256[] memory withoutCalculator = _sequencerRewardsWithoutCalculator(_snapshot, _length, proposers);
    _assertPremiums(proposers, withCalculator, withoutCalculator, _premiumReward);
  }

  function _premiumReward(address _proposer) internal view returns (uint256) {
    address registry = registryOf[_proposer];
    assertTrue(registry != address(0), "not a validator");
    return registry == address(firstRegistry) ? FIRST_REWARD : SECOND_REWARD;
  }
}
