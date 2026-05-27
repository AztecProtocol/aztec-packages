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
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {SlashRound} from "@aztec/core/libraries/SlashRoundLib.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";

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

contract BenchmarkRollupTest is FeeModelTestPoints, DecoderBase {
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

  Multicall3 internal multicall = new Multicall3();

  address internal slashingProposer;

  // Benchmark output state. Each test writes one JSONL file of samples to
  // bench-out/raw_<scenario>.jsonl plus a shared bench-out/config.json.
  string internal scenarioName;
  uint256 internal sampleSeq;
  uint256 internal lastSetupEpoch;

  modifier prepare(uint256 _validatorCount, bool _noValidators, TestSlash _slashing) {
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

    RollupBuilder builder = new RollupBuilder(address(this)).setProvingCostPerMana(provingCost)
      .setManaTarget(MANA_TARGET).setSlotDuration(SLOT_DURATION).setEpochDuration(EPOCH_DURATION).setMintFeeAmount(1e30)
      .setValidators(initialValidators).setTargetCommitteeSize(_noValidators ? 0 : TARGET_COMMITTEE_SIZE)
      .setStakingQueueConfig(stakingQueueConfig);

    if (_slashing == TestSlash.TALLY) {
      // For tally slashing, we need a round size that's a multiple of epoch duration
      uint256 tallyRoundSize = EPOCH_DURATION * 2; // 64; // 2 * EPOCH_DURATION (32) = 64
      uint256 tallyQuorum = tallyRoundSize / 2 + 1; // Must be > ROUND_SIZE / 2
      builder.setSlasherEnabled(true).setSlashingQuorum(tallyQuorum).setSlashingRoundSize(tallyRoundSize)
        .setSlashingLifetimeInRounds(5).setSlashingExecutionDelayInRounds(1).setSlashAmountSmall(1e18)
        .setSlashAmountMedium(2e18).setSlashAmountLarge(3e18);
    }

    builder.deploy();

    asset = builder.getConfig().testERC20;
    rollup = builder.getConfig().rollup;
    slasher = Slasher(rollup.getSlasher());
    slashingProposer = address(slasher) == address(0) ? address(0) : slasher.PROPOSER();

    vm.label(coinbase, "coinbase");
    vm.label(address(rollup), "ROLLUP");
    vm.label(address(asset), "ASSET");
    vm.label(rollup.getBurnAddress(), "BURN_ADDRESS");

    _;
  }

  function setUp() public {
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

  function test_no_validators() public prepare(0, true, TestSlash.NONE) {
    _setScenario("no_validators");
    benchmark(TestSlash.NONE);
  }

  function test_100_validators() public prepare(100, false, TestSlash.NONE) {
    _setScenario("validators");
    benchmark(TestSlash.NONE);
  }

  function test_100_slashing_validators() public prepare(100, false, TestSlash.TALLY) {
    _setScenario("slashing");
    benchmark(TestSlash.TALLY);
  }

  /**
   * @notice Initialise per-scenario sample state and write the shared config.
   *         Truncates any prior samples file for this scenario so reruns are clean.
   */
  function _setScenario(string memory _scenario) internal {
    scenarioName = _scenario;
    sampleSeq = 0;
    lastSetupEpoch = type(uint256).max;

    string memory rawPath = _rawPath();
    vm.writeFile(rawPath, "");

    string memory cfgKey = "bench_config";
    vm.serializeUint(cfgKey, "SLOT_DURATION", SLOT_DURATION);
    vm.serializeUint(cfgKey, "EPOCH_DURATION", EPOCH_DURATION);
    vm.serializeUint(cfgKey, "MANA_TARGET", MANA_TARGET);
    vm.serializeUint(cfgKey, "TARGET_COMMITTEE_SIZE", TARGET_COMMITTEE_SIZE);
    string memory cfgJson = vm.serializeUint(cfgKey, "PROOFS_PER_EPOCH", PROOFS_PER_EPOCH);
    vm.writeFile("bench-out/config.json", cfgJson);
  }

  function _rawPath() internal view returns (string memory) {
    return string.concat("bench-out/raw_", scenarioName, ".jsonl");
  }

  /// @dev Counts zero-bytes in a calldata-style buffer for accurate EIP-7623 accounting.
  function _countZeroBytes(bytes memory _data) internal pure returns (uint256 zeros) {
    uint256 len = _data.length;
    for (uint256 i = 0; i < len; i++) {
      if (_data[i] == 0) {
        zeros++;
      }
    }
  }

  function _sampleKey() internal returns (string memory) {
    sampleSeq++;
    return string.concat("s_", vm.toString(sampleSeq));
  }

  function _serializeCommonFields(string memory _key, string memory _flow) internal {
    vm.serializeString(_key, "scenario", scenarioName);
    vm.serializeString(_key, "flow", _flow);
    vm.serializeUint(_key, "epoch", Epoch.unwrap(rollup.getCurrentEpoch()));
    vm.serializeUint(_key, "slot", Slot.unwrap(rollup.getCurrentSlot()));
    vm.serializeUint(_key, "checkpointNumber", rollup.getPendingCheckpointNumber());
  }

  function _recordSetupEpoch(uint256 _executionGas, bool _isFirstCallForEpoch) internal {
    string memory key = _sampleKey();
    _serializeCommonFields(key, "setupEpoch");
    vm.serializeBool(key, "isFirstCallForEpoch", _isFirstCallForEpoch);
    string memory json = vm.serializeUint(key, "executionGas", _executionGas);
    vm.writeLine(_rawPath(), json);
  }

  function _recordPropose(
    string memory _flow,
    bytes memory _calldata,
    uint256 _executionGas,
    uint256 _committeeSize,
    uint256 _attestationCount,
    uint256 _signerCount
  ) internal {
    string memory key = _sampleKey();
    uint256 zeros = _countZeroBytes(_calldata);

    _serializeCommonFields(key, _flow);
    vm.serializeUint(key, "committeeSize", _committeeSize);
    vm.serializeUint(key, "attestationCount", _attestationCount);
    vm.serializeUint(key, "signerCount", _signerCount);
    vm.serializeUint(key, "calldataBytes", _calldata.length);
    vm.serializeUint(key, "zeroBytes", zeros);
    vm.serializeUint(key, "nonZeroBytes", _calldata.length - zeros);
    vm.serializeBool(key, "blobCheckEnforced", false);
    string memory json = vm.serializeUint(key, "executionGas", _executionGas);
    vm.writeLine(_rawPath(), json);
  }

  function _recordSubmitProof(
    bytes memory _calldata,
    uint256 _executionGas,
    uint256 _epochSize,
    uint256 _startCheckpoint,
    uint256 _endCheckpoint
  ) internal {
    string memory key = _sampleKey();
    uint256 zeros = _countZeroBytes(_calldata);

    _serializeCommonFields(key, "submitEpochRootProof");
    vm.serializeUint(key, "epochSize", _epochSize);
    vm.serializeUint(key, "startCheckpoint", _startCheckpoint);
    vm.serializeUint(key, "endCheckpoint", _endCheckpoint);
    vm.serializeUint(key, "calldataBytes", _calldata.length);
    vm.serializeUint(key, "zeroBytes", zeros);
    vm.serializeUint(key, "nonZeroBytes", _calldata.length - zeros);
    string memory json = vm.serializeUint(key, "executionGas", _executionGas);
    vm.writeLine(_rawPath(), json);
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

    ProposeArgs memory proposeArgs = ProposeArgs({
      header: header,
      archive: archiveRoot,
      oracleInput: OracleInput({feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier})
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
    Multicall3.Call3[] memory calls = new Multicall3.Call3[](2);
    uint256 committeeSize = rollup.getEpochCommittee(rollup.getCurrentEpoch()).length;

    {
      CommitteeAttestations memory attestations = AttestationLibHelper.packAttestations(b.attestations);
      bytes memory voteData = createTallyVoteData(committeeSize * 2);
      Signature memory sig = createTallyVoteSignature(proposer, voteData, rollup.getCurrentSlot());

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
    }

    bytes memory aggregateCalldata = abi.encodeCall(multicall.aggregate3, (calls));

    uint256 gasBefore = gasleft();
    multicall.aggregate3(calls);
    uint256 gasUsed = gasBefore - gasleft();

    _recordPropose("proposeAndVote", aggregateCalldata, gasUsed, committeeSize, b.attestations.length, b.signers.length);
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
        uint256 currentEpochU = Epoch.unwrap(rollup.getCurrentEpoch());
        bool isFirstSetupForEpoch = currentEpochU != lastSetupEpoch;
        lastSetupEpoch = currentEpochU;

        uint256 setupGasBefore = gasleft();
        rollup.setupEpoch();
        uint256 setupGasUsed = setupGasBefore - gasleft();
        _recordSetupEpoch(setupGasUsed, isFirstSetupForEpoch);

        Checkpoint memory b = getCheckpoint();
        address proposer = rollup.getCurrentProposer();

        skipBlobCheck(address(rollup));

        // Store the attestations for the current checkpoint number
        uint256 currentCheckpointNumber = rollup.getPendingCheckpointNumber() + 1;
        checkpointAttestations[currentCheckpointNumber] = AttestationLibHelper.packAttestations(b.attestations);

        uint256 committeeSize = rollup.getEpochCommittee(rollup.getCurrentEpoch()).length;

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
            bytes memory proposeCalldata = abi.encodeCall(
              rollup.propose, (b.proposeArgs, attestations, b.signers, b.attestationsAndSignersSignature, b.blobInputs)
            );

            vm.prank(proposer);
            uint256 gasBefore = gasleft();
            rollup.propose(b.proposeArgs, attestations, b.signers, b.attestationsAndSignersSignature, b.blobInputs);
            uint256 gasUsed = gasBefore - gasleft();

            _recordPropose("propose", proposeCalldata, gasUsed, committeeSize, b.attestations.length, b.signers.length);
          }
        } else {
          CommitteeAttestations memory attestations = AttestationLibHelper.packAttestations(b.attestations);
          bytes memory proposeCalldata = abi.encodeCall(
            rollup.propose, (b.proposeArgs, attestations, b.signers, b.attestationsAndSignersSignature, b.blobInputs)
          );

          vm.prank(proposer);
          uint256 gasBefore = gasleft();
          rollup.propose(b.proposeArgs, attestations, b.signers, b.attestationsAndSignersSignature, b.blobInputs);
          uint256 gasUsed = gasBefore - gasleft();

          _recordPropose("propose", proposeCalldata, gasUsed, committeeSize, b.attestations.length, b.signers.length);
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

        bytes32[] memory fees = new bytes32[](Constants.MAX_CHECKPOINTS_PER_EPOCH * 2);

        for (uint256 feeIndex = 0; feeIndex < epochSize; feeIndex++) {
          // we need the minFee, and we cannot just take it from the point. Because it is different
          Timestamp ts = rollup.getTimestampForSlot(Slot.wrap(start + feeIndex));
          uint256 manaMinFee = rollup.getManaMinFeeAt(ts, true);
          uint256 fee = rollup.getFeeHeader(start + feeIndex).manaUsed * manaMinFee;

          fees[feeIndex * 2] = bytes32(uint256(uint160(bytes20(coinbase))));
          fees[feeIndex * 2 + 1] = bytes32(fee);
        }

        CheckpointLog memory endCheckpoint = rollup.getCheckpoint(start + epochSize - 1);

        PublicInputArgs memory args = PublicInputArgs({
          previousArchive: rollup.getCheckpoint(start).archive,
          endArchive: endCheckpoint.archive,
          outHash: endCheckpoint.outHash,
          proverId: address(0)
        });

        {
          SubmitEpochRootProofArgs memory submitArgs = SubmitEpochRootProofArgs({
            start: start,
            end: start + epochSize - 1,
            args: args,
            fees: fees,
            attestations: checkpointAttestations[start + epochSize - 1],
            blobInputs: full.checkpoint.batchedBlobInputs,
            proof: ""
          });

          bytes memory submitCalldata = abi.encodeCall(rollup.submitEpochRootProof, (submitArgs));

          uint256 gasBefore = gasleft();
          rollup.submitEpochRootProof(submitArgs);
          uint256 gasUsed = gasBefore - gasleft();

          _recordSubmitProof(submitCalldata, gasUsed, epochSize, start, start + epochSize - 1);
        }
      }
    }
  }
}
