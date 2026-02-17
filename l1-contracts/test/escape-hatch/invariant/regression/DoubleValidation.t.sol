// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {EscapeHatchBase} from "../../base.sol";
import {EscapeHatchHandler} from "../EscapeHatchHandler.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {IEscapeHatch, IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @notice Regression test for invariant_hatchValidatedAtMostOnce failure
 *
 * @dev Vulnerability: validateProofSubmission can be called multiple times for the same hatch
 *      if the designated proposer leaves, rejoins, and gets selected for a new hatch.
 *
 *      Attack flow:
 *      1. Candidate joins -> selected for Hatch H1 -> validates -> leaves
 *      2. Same candidate rejoins -> selected for Hatch H2 (now PROPOSING again)
 *      3. Attacker calls validateProofSubmission(H1) - the OLD hatch
 *      4. Succeeds because candidate's status is PROPOSING (for H2, not H1!)
 *
 *      Security impact:
 *      - Invalid punishments: Attacker can punish a rejoined candidated
 */
contract DoubleValidationTest is EscapeHatchBase {
  EscapeHatchHandler public handler;

  constructor() {
    vm.prevrandao(keccak256(abi.encode("double validation regression!")));
  }

  function setUp() public override {
    super.setUp();
    handler = new EscapeHatchHandler(escapeHatch, bondToken, address(rollup));
    _warpToSafeEpoch();
  }

  /**
   * @notice EXACT reproduction of invariant_hatchValidatedAtMostOnce failure
   * @dev Shrunk sequence (15 calls):
   */
  function test_regression_hatchValidatedAtMostOnce() public {
    // EXACT sequence from fuzzer
    handler.joinCandidateSet(0);
    handler.joinCandidateSet(114_216_297_176_837_610_883_821_546_226_451_726_984);
    handler.warpForward(
      13_686_305_314_416_837_641_037_059_808_970_480_377_464_484_039_886_861_378_539_486_498_125_301_413
    );
    handler.warpForward(10_000_000_000);
    handler.selectCandidates();
    handler.warpForward(100);
    handler.selectCandidates();
    handler.warpForward(
      115_792_089_237_316_195_423_570_985_008_687_907_853_269_984_665_640_564_039_457_584_007_913_129_639_934
    );
    handler.validateProofSubmission(
      14_269_942_583_723_164_841_365_114_274_712_143_548_835_546_030_057_296_325_580_016_468_921_911_294_613
    );
    handler.leaveCandidateSet(1_083_820);
    handler.joinCandidateSet(50_000_000_000_000_000_000);
    handler.warpForward(503_846_122_708_052_652_175_641_216_134);
    handler.selectCandidates();
    handler.warpForward(3_775_929_041_506_453_721_696_142_221_884_263_986_342_118_338_704_427);
    handler.validateProofSubmission(6578);

    // Check invariant: each hatch should be validated at most once
    uint256 preparedCount = handler.getPreparedHatchesCount();

    for (uint256 i = 0; i < preparedCount; i++) {
      Hatch hatch = handler.getPreparedHatch(i);
      uint256 validations = handler.getSuccessfulValidations(hatch);

      assertLe(validations, 1, "Hatch validated more than once - vulnerability detected!");
    }
  }
}
