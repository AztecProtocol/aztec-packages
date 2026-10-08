// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {
  CALCULATOR_GAS_BASE,
  CALCULATOR_GAS_PER_CHECKPOINT
} from "@aztec/core/libraries/rollup/SequencerRewardCalculatorLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";
import {ProbeLib} from "@test/reward-calculators/ProbeLib.sol";
import {RegistryReductionCalculator} from "@test/reward-calculators/reduction/RegistryReductionCalculator.sol";

interface IMainnetRollup {
  function getStatus(address _attester) external view returns (uint8);
}

/**
 * @notice Measures probes and calculator calls, each in its own transaction under isolation.
 */
contract MainnetProbeMeter {
  function probe(address _target, bytes4 _selector, uint256 _gas)
    external
    view
    returns (bool responded, address result, uint256 gasUsed)
  {
    uint256 gasBefore = gasleft();
    (responded, result) = ProbeLib.tryGetAddress(_target, _selector, _gas);
    gasUsed = gasBefore - gasleft();
  }

  function callCalculator(address _calculator, address[] calldata _proposers, uint256 _defaultReward)
    external
    view
    returns (bool success, uint256[] memory rewards, uint256 gasUsed)
  {
    uint256 stipend = CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * _proposers.length;
    uint256 gasBefore = gasleft();
    try ISequencerRewardCalculator(_calculator).getSequencerRewards{gas: stipend}(
      Epoch.wrap(0), _proposers, _defaultReward, 2 * _defaultReward
    ) returns (
      uint256[] memory result
    ) {
      gasUsed = gasBefore - gasleft();
      return (true, result, gasUsed);
    } catch {
      gasUsed = gasBefore - gasleft();
    }
  }
}

/**
 * @notice Runs the reference registry reduction calculator against the real Aztec Token Position (ATP) contracts and
 *         the real GSE deployed on Ethereum mainnet, using validators whose stake is held by an ATP staker.
 *
 * @dev The test runs offline by default: `setUp` loads a snapshot of the mainnet accounts and storage slots it
 *      touches from `MAINNET_FIXTURE`. To refresh the snapshot, run with `MAINNET_ATP_FIXTURE_RPC_URL` set to a
 *      mainnet RPC url: `setUp` then forks mainnet at `MAINNET_BLOCK`, replays the reads that the tests perform so
 *      the relevant accounts and slots are pulled into the fork state, dumps them back into the fixture with
 *      `vm.dumpState`, and runs the tests against the fork. The cases below cover both deployed staker
 *      implementations (the v1 and v2 `ATPWithdrawableAndClaimableStaker`), both ATP registries that stake, and both
 *      the direct and the `StakingRegistry` provider staking paths.
 */
contract MainnetReductionCalculatorTest is Test {
  struct MainnetATPCase {
    string name;
    address attester;
    address staker;
    address atp;
    address registry;
  }

  string internal constant MAINNET_FIXTURE = "./test/fixtures/mainnet_atp_reduction_calculator.json";
  string internal constant MAINNET_RPC_URL_ENV = "MAINNET_ATP_FIXTURE_RPC_URL";

  uint256 internal constant MAINNET_BLOCK = 25_934_884;
  address internal constant MAINNET_GSE = 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f;
  address internal constant MAINNET_ROLLUP = 0x91fF8bbD8Ebb07893010D50A48A1609e5EBd8E34;
  address internal constant AUCTION_ATP_REGISTRY = 0x63841bAD6B35b6419e15cA9bBBbDf446D4dC3dde;
  address internal constant GENESIS_SALE_ATP_REGISTRY = 0x8F778768aDed86AB778a47cd81b3b42B4b3F655B;

  uint8 internal constant STATUS_VALIDATING = 1;

  uint256 internal constant DEFAULT_REWARD = 50e18;
  uint96 internal constant AUCTION_REWARD = 10e18;
  uint96 internal constant GENESIS_SALE_REWARD = 20e18;

  MainnetATPCase[] internal cases;
  RegistryReductionCalculator internal calculator;
  MainnetProbeMeter internal meter;
  address internal owner = makeAddr("owner");

  function setUp() public {
    cases.push(
      MainnetATPCase({
        name: "auction ATP, v2 staker, staked directly",
        attester: 0x87094307212E6A10AA62c0cc45bAa8e9182A980d,
        staker: 0x9c8bF8Fa4E88316ADe54b201b64007Afda68fAB4,
        atp: 0x1F37cF7a4BB4a54838b67D3A19a586230e8d0D34,
        registry: AUCTION_ATP_REGISTRY
      })
    );
    cases.push(
      MainnetATPCase({
        name: "genesis sale ATP, v1 staker, staked directly",
        attester: 0x11eb3f22E78700396a952bCc35D74886b61984C1,
        staker: 0x02Cbf45ba5e6364C53F0623c2200F40746a735b9,
        atp: 0x04623F9F5e51e11906e7480F0faA1443974f2506,
        registry: GENESIS_SALE_ATP_REGISTRY
      })
    );
    cases.push(
      MainnetATPCase({
        name: "auction ATP, v2 staker, staked through StakingRegistry provider",
        attester: 0x2721A10C4aCd94d0830Bda103c0Da4F796E5E93e,
        staker: 0x56860f956899139C65d4686b74BfC8238C6D8F57,
        atp: 0xf749391F145a83f64Cf788e1D6b55d225c004FF7,
        registry: AUCTION_ATP_REGISTRY
      })
    );

    string memory rpcUrl = vm.envOr(MAINNET_RPC_URL_ENV, string(""));
    if (bytes(rpcUrl).length == 0) {
      vm.loadAllocs(MAINNET_FIXTURE);
    } else {
      vm.createSelectFork(rpcUrl, MAINNET_BLOCK);
      _readMainnetState();
      // Dump before deploying anything, so the fixture holds mainnet state only.
      vm.dumpState(MAINNET_FIXTURE);
    }

    calculator = new RegistryReductionCalculator(IGSE(MAINNET_GSE), owner);
    meter = new MainnetProbeMeter();
  }

  function test_MainnetATPValidatorsHaveStakerAsWithdrawer() external view {
    for (uint256 i = 0; i < cases.length; i++) {
      MainnetATPCase memory c = cases[i];
      assertEq(IMainnetRollup(MAINNET_ROLLUP).getStatus(c.attester), STATUS_VALIDATING, c.name);
      assertEq(IGSE(MAINNET_GSE).getWithdrawer(c.attester), c.staker, c.name);
      assertEq(IATPStaker(c.staker).getATP(), c.atp, c.name);
      assertEq(IATP(c.atp).getRegistry(), c.registry, c.name);
    }
  }

  function test_MainnetATPStakersDoNotExposeRegistryDirectly() external view {
    for (uint256 i = 0; i < cases.length; i++) {
      (bool responded,) = ProbeLib.tryGetAddress(cases[i].staker, IATP.getRegistry.selector, calculator.PROBE_GAS());
      assertFalse(responded, cases[i].name);
    }
  }

  function test_ResolvesRegistryFromMainnetATPStakers() external view {
    for (uint256 i = 0; i < cases.length; i++) {
      (bool resolved, address registry) = calculator.resolveRegistry(cases[i].attester);
      assertTrue(resolved, cases[i].name);
      assertEq(registry, cases[i].registry, cases[i].name);
    }
  }

  function test_MainnetATPValidatorsOfConfiguredRegistriesAreReduced() external {
    _setRegistryReward(AUCTION_ATP_REGISTRY, AUCTION_REWARD);
    _setRegistryReward(GENESIS_SALE_ATP_REGISTRY, GENESIS_SALE_REWARD);
    _assertRewards(AUCTION_REWARD, GENESIS_SALE_REWARD);
  }

  function test_OnlyMainnetATPValidatorsOfTheConfiguredRegistryAreReduced() external {
    _setRegistryReward(AUCTION_ATP_REGISTRY, AUCTION_REWARD);
    // The genesis sale registry has no entry, so its validator keeps the default.
    _assertRewards(AUCTION_REWARD, DEFAULT_REWARD);
  }

  function test_NoEntriesPayTheDefault() external view {
    _assertRewards(DEFAULT_REWARD, DEFAULT_REWARD);
  }

  function test_MainnetEntriesAreCappedAtTheDefault() external {
    _setRegistryReward(AUCTION_ATP_REGISTRY, uint96(2 * DEFAULT_REWARD));
    _setRegistryReward(GENESIS_SALE_ATP_REGISTRY, uint96(DEFAULT_REWARD));
    _assertRewards(DEFAULT_REWARD, DEFAULT_REWARD);
  }

  /// forge-config: default.isolate = true
  function test_MainnetProbesFitTheProbeStipend() external {
    uint256 probeGas = calculator.PROBE_GAS();
    for (uint256 i = 0; i < cases.length; i++) {
      MainnetATPCase memory c = cases[i];
      uint256 stakerGas = _smallestSufficientProbeGas(c.staker, IATPStaker.getATP.selector, c.atp);
      uint256 atpGas = _smallestSufficientProbeGas(c.atp, IATP.getRegistry.selector, c.registry);
      emit log_named_uint(string.concat(c.name, ": staker.getATP() needs"), stakerGas);
      emit log_named_uint(string.concat(c.name, ": atp.getRegistry() needs"), atpGas);
      // Both hops need well under half of the stipend, so mainnet positions never fall back to the default.
      assertLe(2 * stakerGas, probeGas, c.name);
      assertLe(2 * atpGas, probeGas, c.name);

      (bool responded, address atp, uint256 callerGas) = meter.probe(c.staker, IATPStaker.getATP.selector, probeGas);
      assertTrue(responded, c.name);
      assertEq(atp, c.atp, c.name);
      emit log_named_uint(string.concat(c.name, ": staker probe, caller side"), callerGas);
      address registry;
      (responded, registry, callerGas) = meter.probe(c.atp, IATP.getRegistry.selector, probeGas);
      assertTrue(responded, c.name);
      assertEq(registry, c.registry, c.name);
      emit log_named_uint(string.concat(c.name, ": ATP probe, caller side"), callerGas);
    }
  }

  /// forge-config: default.isolate = true
  function test_MainnetPositionsFitTheCalculatorStipend() external {
    _setRegistryReward(AUCTION_ATP_REGISTRY, AUCTION_REWARD);
    _setRegistryReward(GENESIS_SALE_ATP_REGISTRY, GENESIS_SALE_REWARD);

    for (uint256 i = 0; i < cases.length; i++) {
      address[] memory proposers = new address[](1);
      proposers[0] = cases[i].attester;
      (bool success, uint256[] memory rewards, uint256 gasUsed) =
        meter.callCalculator(address(calculator), proposers, DEFAULT_REWARD);
      assertTrue(success, cases[i].name);
      assertEq(rewards[0], _expected(cases[i], AUCTION_REWARD, GENESIS_SALE_REWARD), cases[i].name);
      emit log_named_uint(string.concat(cases[i].name, ": calculator, one proposer"), gasUsed);
    }

    (bool ok, uint256[] memory all, uint256 allGas) =
      meter.callCalculator(address(calculator), _proposers(), DEFAULT_REWARD);
    assertTrue(ok);
    assertEq(all, _expectedRewards(AUCTION_REWARD, GENESIS_SALE_REWARD));
    emit log_named_uint("calculator, all cases", allGas);
  }

  function _assertRewards(uint256 _auctionReward, uint256 _genesisSaleReward) internal view {
    uint256[] memory rewards = calculator.getSequencerRewards(Epoch.wrap(0), _proposers(), DEFAULT_REWARD, 100e18);
    assertEq(rewards, _expectedRewards(_auctionReward, _genesisSaleReward));
  }

  /// @dev Every case, then every case again (served from the cache), then an address that is not a validator.
  function _proposers() internal view returns (address[] memory proposers) {
    proposers = new address[](2 * cases.length + 1);
    for (uint256 i = 0; i < cases.length; i++) {
      proposers[i] = cases[i].attester;
      proposers[cases.length + i] = cases[cases.length - 1 - i].attester;
    }
    proposers[2 * cases.length] = address(uint160(uint256(keccak256("not a validator"))));
  }

  function _expectedRewards(uint256 _auctionReward, uint256 _genesisSaleReward)
    internal
    view
    returns (uint256[] memory expected)
  {
    expected = new uint256[](2 * cases.length + 1);
    for (uint256 i = 0; i < cases.length; i++) {
      expected[i] = _expected(cases[i], _auctionReward, _genesisSaleReward);
      expected[cases.length + i] = _expected(cases[cases.length - 1 - i], _auctionReward, _genesisSaleReward);
    }
    expected[2 * cases.length] = DEFAULT_REWARD;
  }

  function _expected(MainnetATPCase memory _case, uint256 _auctionReward, uint256 _genesisSaleReward)
    internal
    pure
    returns (uint256)
  {
    return _case.registry == AUCTION_ATP_REGISTRY ? _auctionReward : _genesisSaleReward;
  }

  function _setRegistryReward(address _registry, uint96 _reward) internal {
    vm.prank(owner);
    calculator.setRegistryReward(_registry, _reward);
  }

  /// @dev The smallest probe stipend with which `_target` answers `_expected`, each attempt with cold accounts.
  function _smallestSufficientProbeGas(address _target, bytes4 _selector, address _expected)
    internal
    view
    returns (uint256 low)
  {
    low = 0;
    uint256 high = calculator.PROBE_GAS();
    while (low < high) {
      uint256 mid = (low + high) / 2;
      (bool responded, address result,) = meter.probe(_target, _selector, mid);
      if (responded && result == _expected) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
  }

  function _readMainnetState() internal view {
    for (uint256 i = 0; i < cases.length; i++) {
      MainnetATPCase memory c = cases[i];
      IMainnetRollup(MAINNET_ROLLUP).getStatus(c.attester);
      address withdrawer = IGSE(MAINNET_GSE).getWithdrawer(c.attester);
      ProbeLib.tryGetAddress(withdrawer, IATP.getRegistry.selector, 20_000);
      (, address atp) = ProbeLib.tryGetAddress(withdrawer, IATPStaker.getATP.selector, 20_000);
      ProbeLib.tryGetAddress(atp, IATP.getRegistry.selector, 20_000);
    }
    IGSE(MAINNET_GSE).getWithdrawer(address(uint160(uint256(keccak256("not a validator")))));
  }
}
