// SPDX-License-Identifier: UNLICENSED
// solhint-disable imports-order
pragma solidity >=0.8.27;

/**
 * @title TallySlashingProposer Test Suite
 */
import {Rollup} from "@aztec/core/Rollup.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {TallySlashingProposer} from "@aztec/core/slashing/TallySlashingProposer.sol";
import {SlashRound} from "@aztec/core/libraries/SlashRoundLib.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestBase} from "@test/base/Base.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {TimeCheater} from "@test/staking/TimeCheater.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {SlashPayload} from "@aztec/periphery/SlashPayload.sol";

contract Tmnt456Test is TestBase {
  uint256 internal constant ROUND_SIZE = 1024;
  uint256 internal constant QUORUM = 513;
  uint256 internal constant LIFETIME_IN_ROUNDS = 5;
  uint256 internal constant EXECUTION_DELAY_IN_ROUNDS = 1;
  uint256 internal constant EPOCH_DURATION = 32;
  uint256 internal constant ROUND_SIZE_IN_EPOCHS = ROUND_SIZE / EPOCH_DURATION;
  uint256 internal constant SLASHING_UNIT = 1e18;
  uint256 internal constant COMMITTEE_SIZE = 4;
  uint256 internal constant SLASH_OFFSET_IN_ROUNDS = 2;
  uint256 internal constant FIRST_SLASH_ROUND = SLASH_OFFSET_IN_ROUNDS;

  TestERC20 internal testERC20;
  Rollup internal rollup;
  Slasher internal slasher;
  TallySlashingProposer internal slashingProposer;
  TimeCheater internal timeCheater;

  // Test validator keys
  uint256[] internal validatorKeys;
  address[] internal validators;

  function setUp() public {
    vm.warp(1 days);
    uint256 validatorCount = 4;
    validatorKeys = new uint256[](validatorCount);
    validators = new address[](validatorCount);

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](validatorCount);

    for (uint256 i = 1; i < validatorCount + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);

      validatorKeys[i - 1] = attesterPrivateKey;
      validators[i - 1] = attester;

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        withdrawer: address(this),
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }

    RollupBuilder builder = new RollupBuilder(address(this)).setValidators(initialValidators)
      .setTargetCommitteeSize(COMMITTEE_SIZE).setSlashingQuorum(QUORUM).setSlashingRoundSize(ROUND_SIZE)
      .setSlashingLifetimeInRounds(LIFETIME_IN_ROUNDS).setSlashingExecutionDelayInRounds(EXECUTION_DELAY_IN_ROUNDS)
      .setEpochDuration(EPOCH_DURATION).setSlashAmountSmall(SLASHING_UNIT).setSlashAmountMedium(SLASHING_UNIT * 2)
      .setSlashAmountLarge(SLASHING_UNIT * 3).setSlasherFlavor(SlasherFlavor.TALLY);
    builder.deploy();

    rollup = builder.getConfig().rollup;
    testERC20 = builder.getConfig().testERC20;
    slasher = Slasher(rollup.getSlasher());
    slashingProposer = TallySlashingProposer(slasher.PROPOSER());

    timeCheater = new TimeCheater(
      address(rollup),
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );

    // Jump forward 2 epochs for sampling delay
    timeCheater.cheat__jumpForwardEpochs(2);

    assertEq(rollup.getActiveAttesterCount(), validatorCount, "Invalid attester count");

    _jumpToSlashRound(FIRST_SLASH_ROUND);
  }

  function test_tmnt456() public {
    // NOTE:    A test where the tally slasher will be created to include 1024 slots in a round
    //          Now we simply start signalling to slash!

    bytes memory voteData = new bytes(COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4);
    for (uint256 i = 0; i < voteData.length; i++) {
      voteData[i] = bytes1(0xff);
    }

    for (uint256 i = 0; i < ROUND_SIZE; i++) {
      address proposer = rollup.getCurrentProposer();
      Signature memory sig = _createSignature(_getProposerKey(), rollup.getCurrentSlot(), voteData);

      vm.prank(proposer);
      slashingProposer.vote(voteData, sig);

      vm.warp(block.timestamp + TestConstants.AZTEC_SLOT_DURATION);
    }
  }

  function _getProposerKey() internal returns (uint256) {
    // Returns the private key of the current proposer
    address proposer = rollup.getCurrentProposer();
    uint256 proposerKey = 0;
    for (uint256 i = 0; i < validators.length; i++) {
      if (validators[i] == proposer) {
        proposerKey = validatorKeys[i];
        break;
      }
    }

    require(proposerKey != 0, "Proposer not found");
    return proposerKey;
  }

  function _createSignature(uint256 privateKey, Slot slot, bytes memory votes)
    internal
    view
    returns (Signature memory)
  {
    // Get the EIP-712 signature digest from the contract
    bytes32 digest = slashingProposer.getVoteSignatureDigest(votes, slot);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
    return Signature({v: v, r: r, s: s});
  }

  function _jumpToSlashRound(uint256 targetSlashRound) internal {
    // Get current round first to ensure we don't go backwards
    SlashRound currentSlashRound = slashingProposer.getCurrentRound();
    require(targetSlashRound >= SlashRound.unwrap(currentSlashRound), "Target slash round must be greater than current");
    if (targetSlashRound == SlashRound.unwrap(currentSlashRound)) {
      return; // Already at target round
    }
    uint256 targetSlot = targetSlashRound * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(targetSlot);
  }
}
