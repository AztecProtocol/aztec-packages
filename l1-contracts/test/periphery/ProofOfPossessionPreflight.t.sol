// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GSE, IGSECore} from "@aztec/governance/GSE.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IBn254LibWrapper} from "@aztec/governance/interfaces/IBn254LibWrapper.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
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
}
