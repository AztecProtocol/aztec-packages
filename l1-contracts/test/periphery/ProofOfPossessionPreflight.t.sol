// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GSE, IGSECore} from "@aztec/governance/GSE.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Bn254LibWrapper} from "@aztec/governance/Bn254LibWrapper.sol";
import {IBn254LibWrapper} from "@aztec/governance/interfaces/IBn254LibWrapper.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {ProofOfPossessionPreflight} from "@aztec/periphery/ProofOfPossessionPreflight.sol";
import {
  IProofOfPossessionPreflight,
  PopPreflightResult,
  PopPreflightStatus
} from "@aztec/periphery/interfaces/IProofOfPossessionPreflight.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {BN254Fixtures} from "@test/shared/BN254Fixtures.t.sol";

// solhint-disable comprehensive-interface

/**
 * @notice Shared setup: a real GSE (with the real Bn254LibWrapper it creates) wired to Governance, one registered
 *         rollup instance, and registration tuples built the way validator tooling builds them today.
 */
contract ProofOfPossessionPreflightBase is BN254Fixtures {
  struct RegistrationTuple {
    G1Point pk1;
    G2Point pk2;
    G1Point sig;
  }

  /**
   * A valid key whose digest point needs 95 hashToPoint loop attempts, 18 of which reach the modexp square root.
   * Its proof of possession costs about 216k gas to verify with pre-Osaka modexp pricing and about 264k with the
   * EIP-7883 (Osaka) pricing, so it does not fit the GSE's default 250k cap from Osaka on.
   */
  uint256 internal constant TAIL_KEY_SK = 57_193;

  uint64 internal constant DEFAULT_CAP = 250_000;

  TestERC20 internal stakingAsset;
  GSE internal gse;
  Governance internal governance;
  address internal instance = makeAddr("instance");
  uint256 internal attesterNonce;
  ProofOfPossessionPreflight internal preflight;

  function setUp() public virtual override(BN254Fixtures) {
    super.setUp();

    stakingAsset = new TestERC20("test", "TEST", address(this));
    gse = new GSE(address(this), stakingAsset, TestConstants.ACTIVATION_THRESHOLD, TestConstants.EJECTION_THRESHOLD);
    Registry registry = new Registry(address(this), stakingAsset);
    GovernanceProposer proposer = new GovernanceProposer(registry, gse, 1, 1);
    governance =
      new Governance(stakingAsset, address(proposer), address(gse), TestConstants.getGovernanceConfiguration());
    gse.setGovernance(governance);
    gse.addRollup(instance);

    assertEq(gse.proofOfPossessionGasLimit(), DEFAULT_CAP, "unexpected default cap");

    preflight = new ProofOfPossessionPreflight();
  }

  function _preflight(RegistrationTuple memory _t) internal view returns (PopPreflightResult memory) {
    return preflight.checkProofOfPossession(gse, _t.pk1, _t.pk2, _t.sig);
  }

  function _preflightWithGas(RegistrationTuple memory _t, uint256 _gas)
    internal
    view
    returns (PopPreflightResult memory)
  {
    return preflight.checkProofOfPossession{gas: _gas}(gse, _t.pk1, _t.pk2, _t.sig);
  }

  /**
   * @notice Builds a registration tuple the way validator tooling does today: read the digest point from
   *         `GSE.getRegistrationDigest` (an uncapped call) and sign it locally. Nothing in this path runs the
   *         verification under the GSE's gas cap.
   */
  function _registrationTuple(uint256 _sk, G2Point memory _pk2) internal view returns (RegistrationTuple memory) {
    G1Point memory pk1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), _sk);
    G1Point memory digest = gse.getRegistrationDigest(pk1);
    return RegistrationTuple({pk1: pk1, pk2: _pk2, sig: BN254Lib.g1Mul(digest, _sk)});
  }

  function _sampleKeyTuple(uint256 _index) internal view returns (RegistrationTuple memory) {
    FixtureKey memory key = fixtureData.sampleKeys[_index];
    return _registrationTuple(key.sk, key.pk2);
  }

  function _tailKeyTuple() internal view returns (RegistrationTuple memory) {
    // pk2 = 57193 * G2, computed off-chain (there is no G2 multiplication precompile). The pairing in the proof of
    // possession checks that pk1 and pk2 share the secret key, so a wrong constant here fails every test using it.
    G2Point memory pk2 = G2Point({
      x0: 4_108_871_800_218_288_796_376_100_643_414_842_775_426_973_973_620_923_314_445_929_439_806_343_436_747,
      x1: 8_205_344_544_792_510_863_308_006_076_271_968_471_401_336_642_242_735_294_244_935_142_712_583_804_467,
      y0: 11_911_270_685_295_904_382_411_960_005_926_849_678_736_739_462_286_783_606_038_479_638_977_097_535_025,
      y1: 18_237_993_516_253_034_764_745_364_811_215_969_817_450_672_919_378_409_284_484_652_336_985_568_614_804
    });
    return _registrationTuple(TAIL_KEY_SK, pk2);
  }

  /// @notice The wrapper GSE creates in a field initializer: its CREATE address at nonce 1.
  function _wrapper() internal view returns (IBn254LibWrapper) {
    return IBn254LibWrapper(vm.computeCreateAddress(address(gse), 1));
  }

  /// @notice Whether the wrapper verifies the tuple when its call frame gets exactly `_gas`.
  function _verifiesWithGas(RegistrationTuple memory _t, uint256 _gas) internal view returns (bool) {
    try _wrapper().proofOfPossession{gas: _gas}(_t.pk1, _t.pk2, _t.sig) returns (bool ok) {
      return ok;
    } catch {
      return false;
    }
  }

  /// @notice The smallest call-frame gas with which the wrapper verifies the tuple (binary search).
  function _minimalCap(RegistrationTuple memory _t) internal view returns (uint256) {
    uint256 lo = 0;
    uint256 hi = 5_000_000;
    require(_verifiesWithGas(_t, hi), "tuple does not verify");
    while (hi - lo > 1) {
      uint256 mid = (lo + hi) / 2;
      if (_verifiesWithGas(_t, mid)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return hi;
  }

  /**
   * @notice Whether `GSE.deposit` accepts the tuple for a fresh attester, given ample outer gas. State is rolled
   *         back afterwards.
   */
  function _gseAccepts(RegistrationTuple memory _t) internal returns (bool accepted) {
    uint256 snapshot = vm.snapshotState();
    address attester = address(uint160(uint256(keccak256(abi.encode("attester", attesterNonce++)))));
    uint256 amount = gse.ACTIVATION_THRESHOLD();
    stakingAsset.mint(instance, amount);
    vm.prank(instance);
    stakingAsset.approve(address(gse), amount);
    vm.prank(instance);
    (accepted,) = address(gse)
    .call{gas: 10_000_000}(abi.encodeCall(IGSECore.deposit, (attester, attester, _t.pk1, _t.pk2, _t.sig, false)));
    vm.revertToState(snapshot);
  }

  function _setCap(uint256 _cap) internal {
    vm.prank(gse.owner());
    gse.setProofOfPossessionGasLimit(uint64(_cap));
  }

  /**
   * @notice Whether the EVM prices modexp per EIP-7883 (Osaka and later). BN254Lib.sqrt's modexp costs 4,016 gas
   *         under that pricing and 1,338 gas before it.
   */
  function _isModexpRepriced() internal view returns (bool) {
    bytes memory input = abi.encodePacked(
      uint256(32),
      uint256(32),
      uint256(32),
      uint256(4),
      uint256(0xc19139cb84c680a6e14116da060561765e05aa45a1c72a34f082305b61f3f52),
      BN254Lib.BASE_FIELD_ORDER
    );
    (bool ok,) = address(0x05).staticcall{gas: 3000}(input);
    return !ok;
  }
}

contract ProofOfPossessionPreflightTest is ProofOfPossessionPreflightBase {
  /**
   * @notice Today's registration path (digest from `getRegistrationDigest`, local signing) produces a valid tuple for
   *         the tail key, and nothing in it notices that the GSE rejects the tuple at its gas cap.
   */
  function test_RegistrationDigestPathMissesKeyOverTheCap() external {
    RegistrationTuple memory t = _tailKeyTuple();
    assertEq(t.pk1.x, 0x1a1383977034b577ba8926d30c99597e834be3771805097c749b29b43bdf71cc, "unexpected pk1.x");

    // The tuple is valid: an uncapped verification accepts it.
    assertTrue(_wrapper().proofOfPossession(t.pk1, t.pk2, t.sig), "tuple is not valid");

    // From Osaka on, the default cap is already too small for this key. Before Osaka the key fits the default cap,
    // so lower the cap to just below what the key needs.
    if (_isModexpRepriced()) {
      assertGt(_minimalCap(t), DEFAULT_CAP, "tail key fits the default cap");
    } else {
      _setCap(_minimalCap(t) - 1);
    }

    assertFalse(_gseAccepts(t), "GSE accepted the tail key");
  }

  function test_ValidKeyIsValid() external {
    RegistrationTuple memory t = _sampleKeyTuple(0);
    PopPreflightResult memory result = _preflight(t);

    assertEq(uint8(result.status), uint8(PopPreflightStatus.Valid), "status");
    assertEq(result.cap, DEFAULT_CAP, "cap");
    assertEq(result.wrapper, address(_wrapper()), "wrapper");
    assertGt(result.gasUsed, 100_000, "gasUsed too low");
    assertLt(result.gasUsed, _minimalCap(t), "gasUsed above the minimal cap");
    assertTrue(_gseAccepts(t), "GSE rejected the tuple");
  }

  /// @notice Every fixture key gets the verdict GSE.deposit gives it.
  function test_FixtureKeysMatchGse() external {
    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      RegistrationTuple memory t = _sampleKeyTuple(i);
      PopPreflightStatus status = _preflight(t).status;
      if (_gseAccepts(t)) {
        assertEq(uint8(status), uint8(PopPreflightStatus.Valid), "accepted key not Valid");
      } else {
        assertEq(uint8(status), uint8(PopPreflightStatus.OverBudget), "rejected valid key not OverBudget");
      }
    }
  }

  function test_InvalidSignatureIsInvalid() external {
    RegistrationTuple memory t = _sampleKeyTuple(0);
    t.sig = _sampleKeyTuple(1).sig;

    _assertInvalid(t);
  }

  function test_WrongPk2IsInvalid() external {
    RegistrationTuple memory t = _sampleKeyTuple(0);
    t.pk2 = fixtureData.sampleKeys[1].pk2;

    _assertInvalid(t);
  }

  /// @notice A point off the curve makes a precompile fail and burn its gas; that is still Invalid, not OverBudget.
  function test_OffCurvePointIsInvalid() external {
    RegistrationTuple memory t = _sampleKeyTuple(0);
    t.sig = G1Point({x: 1, y: 3});

    _assertInvalid(t);
  }

  function test_InfinityIsInvalid() external {
    RegistrationTuple memory t = _sampleKeyTuple(0);
    t.pk2 = BN254Lib.g2Zero();

    _assertInvalid(t);
  }

  /**
   * @notice The tail key at the default 250k cap: over budget from Osaka on, valid before. Either way the preflight
   *         agrees with GSE.deposit.
   */
  function test_TailKeyAtDefaultCap() external {
    RegistrationTuple memory t = _tailKeyTuple();
    PopPreflightResult memory result = _preflight(t);

    emit log_named_uint("tail key gasUsed", result.gasUsed);
    emit log_named_uint("tail key minimal cap", _minimalCap(t));

    if (_isModexpRepriced()) {
      assertEq(uint8(result.status), uint8(PopPreflightStatus.OverBudget), "status");
      assertGt(result.gasUsed, DEFAULT_CAP, "gasUsed");
      assertFalse(_gseAccepts(t), "GSE accepted the tuple");
    } else {
      assertEq(uint8(result.status), uint8(PopPreflightStatus.Valid), "status");
      assertTrue(_gseAccepts(t), "GSE rejected the tuple");
    }
  }

  /// @notice Once the GSE owner raises the cap above the tail key's cost, the key is valid and GSE accepts it.
  function test_TailKeyIsValidAfterOwnerRaisesCap() external {
    RegistrationTuple memory t = _tailKeyTuple();
    _setCap(_minimalCap(t) - 1);
    assertEq(uint8(_preflight(t).status), uint8(PopPreflightStatus.OverBudget), "status before");
    assertFalse(_gseAccepts(t), "GSE accepted the tuple");

    _setCap(300_000);
    PopPreflightResult memory result = _preflight(t);
    assertEq(uint8(result.status), uint8(PopPreflightStatus.Valid), "status after");
    assertEq(result.cap, 300_000, "cap");
    assertTrue(_gseAccepts(t), "GSE rejected the tuple");
  }

  /// @notice At a cap equal to the gas a key needs it is Valid, one gas below it is OverBudget, exactly as GSE.
  function test_ExactBudgetBoundary() external {
    RegistrationTuple[2] memory tuples = [_sampleKeyTuple(0), _tailKeyTuple()];
    for (uint256 i = 0; i < tuples.length; i++) {
      uint256 minimalCap = _minimalCap(tuples[i]);

      _setCap(minimalCap);
      assertEq(uint8(_preflight(tuples[i]).status), uint8(PopPreflightStatus.Valid), "status at the boundary");
      assertTrue(_gseAccepts(tuples[i]), "GSE rejected the tuple at the boundary");

      _setCap(minimalCap - 1);
      assertEq(uint8(_preflight(tuples[i]).status), uint8(PopPreflightStatus.OverBudget), "status below the boundary");
      assertFalse(_gseAccepts(tuples[i]), "GSE accepted the tuple below the boundary");
    }
  }

  /// @notice For any cap, the preflight's verdict on the tail key matches GSE.deposit's.
  function testFuzz_MatchesGseForAnyCap(uint256 _cap) external {
    _cap = bound(_cap, 0, 400_000);
    RegistrationTuple memory t = _tailKeyTuple();
    _setCap(_cap);

    PopPreflightStatus status = _preflight(t).status;
    if (_gseAccepts(t)) {
      assertEq(uint8(status), uint8(PopPreflightStatus.Valid), "accepted key not Valid");
    } else {
      assertEq(uint8(status), uint8(PopPreflightStatus.OverBudget), "rejected valid key not OverBudget");
    }
  }

  function test_LowOuterGasIsInsufficientOuterGas() external view {
    RegistrationTuple[3] memory tuples = [_sampleKeyTuple(0), _tailKeyTuple(), _invalidTuple()];
    for (uint256 i = 0; i < tuples.length; i++) {
      PopPreflightResult memory result = _preflightWithGas(tuples[i], 1_000_000);
      assertEq(uint8(result.status), uint8(PopPreflightStatus.InsufficientOuterGas), "status");
      assertEq(result.gasUsed, 0, "gasUsed");
    }
  }

  /**
   * @notice With any outer gas, the result is either InsufficientOuterGas or the verdict given with ample gas: too
   *         little gas never shows up as a bad key, an over-budget key or a valid key.
   */
  function testFuzz_OuterGasNeverChangesTheVerdict(uint256 _outerGas, uint8 _which) external {
    _outerGas = bound(_outerGas, 0, 3_000_000);
    RegistrationTuple memory t = _tupleByIndex(_which % 3);
    PopPreflightStatus expected = _preflight(t).status;

    try preflight.checkProofOfPossession{
      gas: _outerGas
    }(gse, t.pk1, t.pk2, t.sig) returns (PopPreflightResult memory result) {
      if (result.status != PopPreflightStatus.InsufficientOuterGas) {
        assertEq(uint8(result.status), uint8(expected), "verdict changed with outer gas");
      }
    } catch (bytes memory reason) {
      // Only running out of gas before the first check, which reverts without data.
      assertEq(reason.length, 0, "unexpected revert");
      assertLt(_outerGas, 30_000, "reverted with enough gas for the first check");
    }
  }

  /// @notice At the smallest outer gas that gets past the gas check, the verdict is already the right one.
  function test_SmallestSufficientOuterGasGivesTheVerdict() external {
    for (uint256 i = 0; i < 3; i++) {
      RegistrationTuple memory t = _tupleByIndex(i);
      PopPreflightStatus expected = _preflight(t).status;

      uint256 lo = 0;
      uint256 hi = 10_000_000;
      while (hi - lo > 1) {
        uint256 mid = (lo + hi) / 2;
        (bool ok, bytes memory ret) = address(preflight)
        .staticcall{
          gas: mid
        }(abi.encodeCall(IProofOfPossessionPreflight.checkProofOfPossession, (gse, t.pk1, t.pk2, t.sig)));
        if (ok && abi.decode(ret, (PopPreflightResult)).status != PopPreflightStatus.InsufficientOuterGas) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      emit log_named_uint("smallest sufficient outer gas", hi);
      assertEq(uint8(_preflightWithGas(t, hi).status), uint8(expected), "verdict at the smallest sufficient gas");
    }
  }

  function test_WrapperIsTheGseCreateAddressAtNonceOne() external {
    address wrapper = vm.computeCreateAddress(address(gse), 1);
    assertEq(preflight.bn254LibWrapperOf(address(gse)), wrapper, "derived address");
    assertEq(wrapper.code, address(new Bn254LibWrapper()).code, "code at the derived address");

    // GSE.deposit calls exactly this address with the cap as gas, and so does the preflight.
    RegistrationTuple memory t = _sampleKeyTuple(0);
    bytes memory data = abi.encodeCall(IBn254LibWrapper.proofOfPossession, (t.pk1, t.pk2, t.sig));
    vm.expectCall(wrapper, 0, DEFAULT_CAP, data);
    _gseAccepts(t);
    vm.expectCall(wrapper, 0, DEFAULT_CAP, data);
    _preflight(t);
  }

  function test_AddressWithoutCodeReverts() external {
    address noCode = makeAddr("noCode");
    RegistrationTuple memory t = _sampleKeyTuple(0);

    vm.expectRevert(
      abi.encodeWithSelector(IProofOfPossessionPreflight.ProofOfPossessionPreflight__NotAGse.selector, noCode)
    );
    preflight.checkProofOfPossession(GSE(noCode), t.pk1, t.pk2, t.sig);
  }

  function test_NonGseContractReverts() external {
    RegistrationTuple memory t = _sampleKeyTuple(0);

    vm.expectRevert(
      abi.encodeWithSelector(
        IProofOfPossessionPreflight.ProofOfPossessionPreflight__NotAGse.selector, address(stakingAsset)
      )
    );
    preflight.checkProofOfPossession(GSE(address(stakingAsset)), t.pk1, t.pk2, t.sig);
  }

  /// @notice A contract that reports a cap but never created a wrapper at nonce 1.
  function test_NoCodeAtDerivedWrapperIsNoWrapper() external {
    CapOnly capOnly = new CapOnly();
    RegistrationTuple memory t = _sampleKeyTuple(0);

    PopPreflightResult memory result = preflight.checkProofOfPossession(GSE(address(capOnly)), t.pk1, t.pk2, t.sig);
    assertEq(uint8(result.status), uint8(PopPreflightStatus.NoWrapper), "status");
    assertEq(result.cap, DEFAULT_CAP, "cap");
    assertEq(result.wrapper, vm.computeCreateAddress(address(capOnly), 1), "wrapper");
  }

  /// @notice The preflight's result does not depend on where its code lives, as with an `eth_call` state override.
  function test_WorksFromAnyAddress() external {
    address elsewhere = makeAddr("elsewhere");
    vm.etch(elsewhere, address(preflight).code);
    RegistrationTuple[3] memory tuples = [_sampleKeyTuple(0), _tailKeyTuple(), _invalidTuple()];
    for (uint256 i = 0; i < tuples.length; i++) {
      PopPreflightResult memory here = _preflight(tuples[i]);
      PopPreflightResult memory there =
        IProofOfPossessionPreflight(elsewhere).checkProofOfPossession(gse, tuples[i].pk1, tuples[i].pk2, tuples[i].sig);
      assertEq(uint8(there.status), uint8(here.status), "status");
      assertEq(there.cap, here.cap, "cap");
      assertEq(there.wrapper, here.wrapper, "wrapper");
    }
  }

  function _assertInvalid(RegistrationTuple memory _t) internal {
    PopPreflightResult memory result = _preflight(_t);
    assertEq(uint8(result.status), uint8(PopPreflightStatus.Invalid), "status");
    assertEq(result.cap, DEFAULT_CAP, "cap");
    assertFalse(_gseAccepts(_t), "GSE accepted the tuple");
  }

  function _invalidTuple() internal view returns (RegistrationTuple memory t) {
    t = _sampleKeyTuple(0);
    t.sig = _sampleKeyTuple(1).sig;
  }

  function _tupleByIndex(uint256 _index) internal view returns (RegistrationTuple memory) {
    if (_index == 0) {
      return _sampleKeyTuple(0);
    }
    if (_index == 1) {
      return _tailKeyTuple();
    }
    return _invalidTuple();
  }
}

contract CapOnly {
  uint64 public proofOfPossessionGasLimit = 250_000;
}
