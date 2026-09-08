// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RewardLibBase} from "@test/rollup/libraries/rewardlib/RewardLibBase.sol";
import {
  IATP,
  IATPStaker,
  RewardLib,
  RegistryRewardOverride,
  MAX_REGISTRY_REWARD_OVERRIDES
} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";

interface IMainnetGSE {
  function getWithdrawer(address _attester) external view returns (address);
}

interface IMainnetRollup {
  function getStatus(address _attester) external view returns (uint8);
}

/**
 * @notice Exercises the registry reward override lookup against the real Aztec Token Position (ATP) contracts
 *         deployed on Ethereum mainnet, using validators whose stake is held by an ATP staker.
 *
 * @dev The test runs offline by default: `setUp` loads a snapshot of the mainnet accounts and storage slots it
 *      touches from `MAINNET_FIXTURE`. To refresh the snapshot, run with `MAINNET_ATP_FIXTURE_RPC_URL` set to a
 *      mainnet RPC url: `setUp` then forks mainnet at `MAINNET_BLOCK`, replays the reads that the tests perform
 *      so the relevant accounts and slots are pulled into the fork state, and dumps them back into the fixture
 *      with `vm.dumpState`. The cases below cover both deployed staker implementations (the v1 and v2
 *      `ATPWithdrawableAndClaimableStaker`), both ATP registries that stake, and both the direct and the
 *      `StakingRegistry` provider staking paths.
 */
contract MainnetATPRewardOverrideTest is RewardLibBase {
  struct MainnetATPCase {
    string name;
    address attester;
    address staker;
    address atp;
    address registry;
  }

  string internal constant MAINNET_FIXTURE = "./test/fixtures/mainnet_atp_reward_override.json";
  string internal constant MAINNET_RPC_URL_ENV = "MAINNET_ATP_FIXTURE_RPC_URL";

  uint256 internal constant MAINNET_BLOCK = 25_934_884;
  address internal constant MAINNET_GSE = 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f;
  address internal constant MAINNET_ROLLUP = 0x91fF8bbD8Ebb07893010D50A48A1609e5EBd8E34;
  address internal constant AUCTION_ATP_REGISTRY = 0x63841bAD6B35b6419e15cA9bBBbDf446D4dC3dde;
  address internal constant GENESIS_SALE_ATP_REGISTRY = 0x8F778768aDed86AB778a47cd81b3b42B4b3F655B;

  uint8 internal constant STATUS_VALIDATING = 1;

  MainnetATPCase[] internal cases;

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
      return;
    }

    vm.createSelectFork(rpcUrl, MAINNET_BLOCK);
    _readMainnetState();
    vm.dumpState(MAINNET_FIXTURE);
  }

  function test_MainnetATPValidatorsHaveStakerAsWithdrawer() external view {
    for (uint256 i = 0; i < cases.length; i++) {
      MainnetATPCase memory c = cases[i];
      assertEq(IMainnetRollup(MAINNET_ROLLUP).getStatus(c.attester), STATUS_VALIDATING, c.name);
      assertEq(IMainnetGSE(MAINNET_GSE).getWithdrawer(c.attester), c.staker, c.name);
      assertEq(IATPStaker(c.staker).getATP(), c.atp, c.name);
      assertEq(IATP(c.atp).getRegistry(), c.registry, c.name);
    }
  }

  function test_MainnetATPStakersDoNotExposeRegistryDirectly() external view {
    for (uint256 i = 0; i < cases.length; i++) {
      (bool responded,) = RewardLib.tryGetAddress(cases[i].staker, IATP.getRegistry.selector);
      assertFalse(responded, cases[i].name);
    }
  }

  function test_ResolvesRegistryFromMainnetATPStakers() external view {
    for (uint256 i = 0; i < cases.length; i++) {
      (bool responded, address registry) = RewardLib.tryGetRegistry(cases[i].staker);
      assertTrue(responded, cases[i].name);
      assertEq(registry, cases[i].registry, cases[i].name);
    }
  }

  function test_MainnetATPValidatorsReceiveRegistryRewardOverride() external prepare(100e18, 5000) {
    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[0] = RegistryRewardOverride({registry: AUCTION_ATP_REGISTRY, sequencerReward: 10e18});
    overrides[1] = RegistryRewardOverride({registry: GENESIS_SALE_ATP_REGISTRY, sequencerReward: 20e18});

    _settleEachCaseAndAssertSequencerRewards(overrides, 10e18, 20e18);
  }

  function test_OnlyMainnetATPValidatorsOfOverriddenRegistryReceiveOverride() external prepare(100e18, 5000) {
    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[0] = RegistryRewardOverride({registry: AUCTION_ATP_REGISTRY, sequencerReward: 10e18});

    // The genesis sale registry has no override, so its validator keeps the default 50% of 100e18.
    _settleEachCaseAndAssertSequencerRewards(overrides, 10e18, 50e18);
  }

  function _settleEachCaseAndAssertSequencerRewards(
    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory _overrides,
    uint256 _auctionSequencerReward,
    uint256 _genesisSaleSequencerReward
  ) internal {
    // Each case settles a different epoch, so move past them to make their sample seeds stable.
    vm.warp(
      block.timestamp + (cases.length + 1) * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION
    );

    uint256 expectedSequencerRewards = 0;
    for (uint256 i = 0; i < cases.length; i++) {
      MainnetATPCase memory c = cases[i];
      wrapper.setWithdrawer(c.attester, IMainnetGSE(MAINNET_GSE).getWithdrawer(c.attester));

      address[] memory committee = new address[](1);
      committee[0] = c.attester;
      wrapper.handleRewardsAndFees(args, Epoch.wrap(i), committee, _overrides);

      expectedSequencerRewards += c.registry == AUCTION_ATP_REGISTRY
        ? _auctionSequencerReward
        : _genesisSaleSequencerReward;
      assertEq(wrapper.getSequencerRewards(sequencer), expectedSequencerRewards, c.name);
      assertEq(wrapper.getCollectiveProverRewardsForEpoch(Epoch.wrap(i)), 50e18, c.name);
    }
  }

  function _readMainnetState() internal view {
    for (uint256 i = 0; i < cases.length; i++) {
      MainnetATPCase memory c = cases[i];
      IMainnetRollup(MAINNET_ROLLUP).getStatus(c.attester);
      address withdrawer = IMainnetGSE(MAINNET_GSE).getWithdrawer(c.attester);
      RewardLib.tryGetAddress(withdrawer, IATP.getRegistry.selector);
      RewardLib.tryGetRegistry(withdrawer);
    }
  }
}
