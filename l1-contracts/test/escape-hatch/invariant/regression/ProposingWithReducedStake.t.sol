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
 * @notice  Regression test for invariant failures in EscapeHatch
 *          Fails the invaraint proposingHasStake that requires the stake of the proposer is BOND_SIZE.
 */
contract ProposingWithZeroStakeTest is EscapeHatchBase {
  EscapeHatchHandler public handler;

  constructor() {
    vm.prevrandao(keccak256(abi.encode("we drawing some random values")));
  }

  function setUp() public override {
    super.setUp();
    handler = new EscapeHatchHandler(escapeHatch, bondToken, address(rollup));
    _warpToSafeEpoch();
  }

  /**
   * @notice EXACT reproduction of invariant_proposingHasStake failure
   * @dev Shrunk sequence (41 calls):
   */
  function test_regression_proposingHasStake() public {
    uint256 bondSize = uint256(escapeHatch.getBondSize());

    // EXACT sequence from fuzzer
    handler.warpForward(2_824_477_467_456_596_346_228_868_038_637_034_504_331_520_127_133_807_155_636_117_336_302_704);
    handler.warpForward(178_844_308_625_228_271);
    handler.warpForward(2_521_666_719_935_273_539_421);
    handler.warpForward(220_718_020_578_954_764_900_271_365_370_721);
    handler.warpForward(12_115);
    handler.warpForward(2_412_538_233);
    handler.warpForward(20_304_882_871_137_241_980_480_467_611_841_396_940);
    handler.warpForward(1755);
    handler.warpForward(169_560_412_410_043_360_664_217_676_337_631_069_516_309_274_850_175_680_516_795_411_785_575_193);
    handler.warpForward(1_781_803_167_516_943_745_296_077_023_187);
    handler.warpForward(53_095_053_366_129_528_675);
    handler.warpForward(
      115_792_089_237_316_195_423_570_985_008_687_907_853_269_984_665_640_564_039_457_584_007_913_129_639_933
    );
    handler.warpForward(20_228);
    handler.joinCandidateSet(42_660_209_512_817_894);
    handler.joinCandidateSet(
      45_643_247_224_803_323_604_075_385_900_085_380_717_238_843_548_200_849_235_216_155_367_865_436_608_336
    );
    handler.warpForward(11_112);
    handler.joinCandidateSet(0);
    handler.warpForward(5_964_442_327_846_637_180_649_223_832_909_307_299_748_296_989_181_914_296_632_028_379);
    handler.initiateExit(
      399_033_309_794_607_659_577_396_726_697_475_780_420_059_112_793_694_955_714_002_088_199_116_710
    );
    handler.warpForward(113_311_457_773_208);
    handler.warpForward(3_187_066_283_853_967_021_264_566_282_063_810_566_468_790_530_868_925_093_641);
    handler.selectCandidates();
    handler.warpForward(
      20_781_303_865_898_164_972_406_668_675_205_299_778_034_140_150_338_732_886_284_685_904_031_382_974_310
    );
    handler.warpForward(304_983_760_430);
    handler.joinCandidateSet(68_237_601_299_267_754_882_747_282_765_848_067_260_418_074_100_688);
    handler.warpForward(14_024_246_874_111_148_865_794_668_852_634_848_279_022_726_563_869_949);
    handler.warpForward(2);
    handler.warpForward(0);
    handler.warpForward(
      1_360_094_497_134_260_752_480_931_123_258_898_314_820_871_629_131_258_058_359_052_522_795_884_080_910
    );
    handler.validateProofSubmission(1); // Use odd seed to trigger "recent hatch" search
    handler.leaveCandidateSet(
      115_792_089_237_316_195_423_570_985_008_687_907_853_269_984_665_640_564_039_457_584_007_913_129_639_932
    );
    handler.warpForward(4361);
    handler.selectCandidates();
    handler.warpForward(44_278_464_488_857_702_280_783_909_832_998_130_970_054_540_594_146);
    handler.joinCandidateSet(386);
    handler.warpForward(11_039);
    handler.warpForward(1_233_179_604_270_573_617_401_151_615);
    handler.selectCandidates();
    handler.warpForward(10_699_940_832_789_919_103_478_815_951_508_386_265_232_493_688_250_866_834_293_398_903_264);
    handler.validateProofSubmission(1); // Use odd seed to trigger "recent hatch" search
    handler.selectCandidates();

    // Check invariant: PROPOSING candidates must have full stake
    for (uint256 i = 0; i < 10; i++) {
      address candidate = handler.getActor(i);
      CandidateInfo memory info = escapeHatch.getCandidateInfo(candidate);

      if (info.status == Status.PROPOSING) {
        assertEq(info.amount, bondSize, "PROPOSING candidate must have stake at risk");
      }
    }
  }
}
