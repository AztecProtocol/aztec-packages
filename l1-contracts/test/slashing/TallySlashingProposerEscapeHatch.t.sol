// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
pragma solidity >=0.8.27;

import {Rollup} from "@aztec/core/Rollup.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {IEscapeHatch, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TallySlashingProposer} from "@aztec/core/slashing/TallySlashingProposer.sol";
import {SlashRound} from "@aztec/core/libraries/SlashRoundLib.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestBase} from "@test/base/Base.sol";
import {TimeCheater} from "@test/staking/TimeCheater.sol";
import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";

contract TallySlashingProposerEscapeHatchTest is TestBase {
  using stdStorage for StdStorage;

  // Mirror the base slashing test constants for comparability
  uint256 internal constant SLASHING_UNIT = 1e18;
  uint256 internal constant QUORUM = 3;
  uint256 internal constant ROUND_SIZE_IN_EPOCHS = 2; // epochs
  uint256 internal constant EPOCH_DURATION = 2; // slots
  uint256 internal constant ROUND_SIZE = ROUND_SIZE_IN_EPOCHS * EPOCH_DURATION; // slots
  uint256 internal constant COMMITTEE_SIZE = 4;
  uint256 internal constant LIFETIME_IN_ROUNDS = 5;
  uint256 internal constant EXECUTION_DELAY_IN_ROUNDS = 1;
  uint256 internal constant SLASH_OFFSET_IN_ROUNDS = 4;

  // Escape hatch config (picked to make isHatchOpen true for all epochs)
  uint96 internal constant BOND_SIZE = 1e18;
  uint96 internal constant WITHDRAWAL_TAX = 0;
  uint96 internal constant FAILED_HATCH_PUNISHMENT = 0;
  uint256 internal constant ESCAPE_FREQUENCY = 3;
  uint256 internal constant ESCAPE_ACTIVE_DURATION = 2;
  uint256 internal constant ESCAPE_LAG_IN_HATCHES = 1;
  uint256 internal constant ESCAPE_EXIT_DELAY = 1;

  Rollup internal rollup;
  Slasher internal slasher;
  TallySlashingProposer internal slashingProposer;
  EscapeHatch internal escapeHatch;
  TestERC20 internal bondToken;
  TimeCheater internal timeCheater;

  uint256[] internal validatorKeys;
  address[] internal validators;

  mapping(address => bool) internal validatorsWithSlashes;

  function setUp() public {
    vm.warp(1 days);
    uint256 validatorCount = 4;
    validatorKeys = new uint256[](validatorCount);
    validators = new address[](validatorCount);

    // Sanity: ensure the escape cadence has a boundary we can test against. By making one of them odd, we can ensure
    // that the hatch "moves" around and is not always the start of the round etc.
    require(ESCAPE_FREQUENCY != ESCAPE_ACTIVE_DURATION, "hatch cadence degenerate");
    require((ESCAPE_FREQUENCY & 1 == 1) || (ESCAPE_ACTIVE_DURATION & 1 == 1), "hatch cadence lacks odd boundary");

    // Build validator deposits
    RollupBuilder builder = new RollupBuilder(address(this));
    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](validatorCount);
    for (uint256 i = 1; i < validatorCount + 1; i++) {
      uint256 pk = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(pk);
      validatorKeys[i - 1] = pk;
      validators[i - 1] = attester;
      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        withdrawer: address(this),
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }

    builder.setEpochDuration(EPOCH_DURATION).setTargetCommitteeSize(COMMITTEE_SIZE).setSlashingQuorum(QUORUM)
      .setSlashingRoundSize(ROUND_SIZE).setSlashingLifetimeInRounds(LIFETIME_IN_ROUNDS)
      .setSlashingExecutionDelayInRounds(EXECUTION_DELAY_IN_ROUNDS).setSlashAmountSmall(SLASHING_UNIT)
      .setSlashAmountMedium(SLASHING_UNIT * 2).setSlashAmountLarge(SLASHING_UNIT * 3)
      .setSlasherFlavor(SlasherFlavor.TALLY).setValidators(initialValidators);

    builder.deploy();

    rollup = builder.getConfig().rollup;
    bondToken = builder.getConfig().testERC20;
    slasher = Slasher(rollup.getSlasher());
    slashingProposer = TallySlashingProposer(slasher.PROPOSER());

    timeCheater = new TimeCheater(
      address(rollup),
      block.timestamp,
      builder.getConfig().rollupConfigInput.aztecSlotDuration,
      builder.getConfig().rollupConfigInput.aztecEpochDuration,
      builder.getConfig().rollupConfigInput.aztecProofSubmissionEpochs
    );

    // Jump forward for sampling delay
    timeCheater.cheat__jumpForwardEpochs(rollup.getLagInEpochsForValidatorSet());

    escapeHatch = new EscapeHatch(
      address(rollup),
      address(bondToken),
      BOND_SIZE,
      WITHDRAWAL_TAX,
      FAILED_HATCH_PUNISHMENT,
      ESCAPE_FREQUENCY,
      ESCAPE_ACTIVE_DURATION,
      ESCAPE_LAG_IN_HATCHES,
      ESCAPE_EXIT_DELAY
    );

    // Point rollup/validator selection to the escape hatch
    address rollupOwner = rollup.owner();
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(escapeHatch));
  }

  function test_tallyEscapeHatch_open() public {
    _runEscapeHatchScenario(true);
  }

  function test_tallyEscapeHatch_closed() public {
    _runEscapeHatchScenario(false);
  }

  function _jumpToSlashRound(uint256 targetSlashRound) internal {
    SlashRound currentSlashRound = slashingProposer.getCurrentRound();
    require(targetSlashRound >= SlashRound.unwrap(currentSlashRound), "Target slash round must be greater than current");
    if (targetSlashRound == SlashRound.unwrap(currentSlashRound)) {
      return;
    }
    uint256 targetSlot = targetSlashRound * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(targetSlot);
  }

  function _runEscapeHatchScenario(bool open) internal {
    // Pick the first round (from the current round onward) where epoch 0 of the round
    // is outside the hatch window while epoch 1 is inside. We check window status
    // via the configured cadence rather than relying on any designated proposer.
    uint256 targetRound = SlashRound.unwrap(slashingProposer.getCurrentRound());
    if (targetRound < SLASH_OFFSET_IN_ROUNDS) {
      targetRound = SLASH_OFFSET_IN_ROUNDS;
    }
    while (true) {
      Epoch epoch0 = slashingProposer.getSlashTargetEpoch(SlashRound.wrap(targetRound), 0);
      Epoch epoch1 = slashingProposer.getSlashTargetEpoch(SlashRound.wrap(targetRound), 1);
      bool firstOpen = Epoch.unwrap(epoch0) % ESCAPE_FREQUENCY < ESCAPE_ACTIVE_DURATION;
      bool secondOpen = Epoch.unwrap(epoch1) % ESCAPE_FREQUENCY < ESCAPE_ACTIVE_DURATION;
      if (!firstOpen && secondOpen) {
        break;
      }
      ++targetRound;
    }
    _jumpToSlashRound(targetRound);
    SlashRound currentRound = slashingProposer.getCurrentRound();

    // Cast enough votes to reach quorum for all validators
    uint8 slashIndex = 3;
    bytes memory voteData = _createUniformVoteData(slashIndex);
    _castVotes(QUORUM, voteData);

    // Configure escape hatch for the second epoch in the round by setting the designated proposer.
    // A hatch is considered open when the designated proposer for that hatch is non-zero, so we
    // write directly to the `$designatedProposer` mapping slot via its getter
    Epoch protectedEpoch = slashingProposer.getSlashTargetEpoch(currentRound, 1);
    uint256 protectedHatch = Epoch.unwrap(protectedEpoch) / ESCAPE_FREQUENCY;
    address proposer = open ? address(0xBEEF) : address(0);
    stdstore.target(address(escapeHatch)).sig("getDesignatedProposer(uint256)").with_key(protectedHatch)
      .checked_write(proposer);

    // Tally results
    address[][] memory committees = slashingProposer.getSlashTargetCommittees(currentRound);
    TallySlashingProposer.SlashAction[] memory actions = slashingProposer.getTally(currentRound, committees);

    assertEq(actions.length, open ? 4 : 8);
    for (uint256 i; i < actions.length; ++i) {
      assertEq(actions[i].slashAmount, uint256(slashIndex) * SLASHING_UNIT);
      assertEq(actions[i].validator, committees[i / COMMITTEE_SIZE][i % COMMITTEE_SIZE]);
    }
  }

  function _createVoteData(uint8[] memory slashAmounts) internal pure returns (bytes memory) {
    bytes memory voteData = new bytes(slashAmounts.length / 4);
    for (uint256 i = 0; i < slashAmounts.length; i += 4) {
      uint8 v0 = slashAmounts[i] & 0x03;
      uint8 v1 = slashAmounts[i + 1] & 0x03;
      uint8 v2 = slashAmounts[i + 2] & 0x03;
      uint8 v3 = slashAmounts[i + 3] & 0x03;
      voteData[i / 4] = bytes1((v3 << 6) | (v2 << 4) | (v1 << 2) | v0);
    }
    return voteData;
  }

  function _createSignature(uint256 privateKey, Slot slot, bytes memory votes)
    internal
    view
    returns (Signature memory)
  {
    bytes32 digest = slashingProposer.getVoteSignatureDigest(votes, slot);
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
    return Signature({v: v, r: r, s: s});
  }

  function _getProposerKey() internal returns (uint256) {
    address proposer = rollup.getCurrentProposer();
    for (uint256 i = 0; i < validators.length; i++) {
      if (validators[i] == proposer) {
        return validatorKeys[i];
      }
    }
    revert("Proposer not found");
  }

  function _createUniformVoteData(uint8 slashAmount) internal pure returns (bytes memory) {
    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    for (uint256 i; i < slashAmounts.length; ++i) {
      slashAmounts[i] = slashAmount;
    }
    return _createVoteData(slashAmounts);
  }

  function _castVotes(uint256 count, bytes memory voteData) internal {
    for (uint256 i; i < count; ++i) {
      Slot slot = rollup.getCurrentSlot();
      uint256 proposerKey = _getProposerKey();
      Signature memory sig = _createSignature(proposerKey, slot, voteData);

      vm.prank(rollup.getCurrentProposer());
      slashingProposer.vote(voteData, sig);

      // Move to next slot to allow another proposer vote within the same round
      if (i + 1 < count) {
        timeCheater.cheat__jumpToSlot(Slot.unwrap(slot) + 1);
      }
    }
  }
}

