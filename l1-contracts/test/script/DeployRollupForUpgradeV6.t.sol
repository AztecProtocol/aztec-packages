// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {DeployAztecL1Contracts, DeployAztecL1ContractsOutput} from "../../script/deploy/DeployAztecL1Contracts.s.sol";
import {DeployRollupForUpgradeV6} from "../../script/deploy/DeployRollupForUpgradeV6.s.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {V6UpgradePayload} from "@aztec/periphery/V6UpgradePayload.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

/**
 * @dev The deploy script with the three genesis roots replaced by stand-ins, and nothing else
 *      changed.
 *
 *      The roots are opaque commitments from the circuits build and move whenever it is rebuilt;
 *      every other literal is a protocol parameter the constructors have opinions about, and those
 *      opinions are what this tests. Substituting them keeps these tests from failing on a rebuild
 *      that has nothing to do with the table.
 */
contract V6ConfigHarness is DeployRollupForUpgradeV6 {
  /// @dev BN254 Fr. The roots are field elements, not arbitrary bytes32 -- the Rollup rejects
  ///      anything at or above this with `Rollup__FieldElementOutOfRange`, so a stand-in has to be
  ///      reduced into the field or it fails for a reason that has nothing to do with the config.
  uint256 internal constant FR =
    21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;

  /// @dev The governance simulation needs forked state -- real voters, mainnet timings -- and is
  ///      the one step of `run()` a local stack cannot satisfy. Skipped here so the config table
  ///      itself can be exercised; the simulation is what runs on deploy day, against a fork.
  function _simulate(address) internal override {}

  function _config() internal view override returns (Config memory c) {
    c = super._config();
    c.vkTreeRoot = bytes32(uint256(keccak256("vkTreeRoot")) % FR);
    c.protocolContractsHash = bytes32(uint256(keccak256("protocolContractsHash")) % FR);
    c.genesisArchiveRoot = bytes32(uint256(keccak256("genesisArchiveRoot")) % FR);
  }
}

/// @dev The table with its genesis roots zeroed, so the guard in `run()` is still exercised now
///      that the real table has them filled in.
contract V6ZeroRootsHarness is DeployRollupForUpgradeV6 {
  function _config() internal view override returns (Config memory c) {
    c = super._config();
    c.vkTreeRoot = bytes32(0);
    c.protocolContractsHash = bytes32(0);
    c.genesisArchiveRoot = bytes32(0);
  }
}

/**
 * @title DeployRollupForUpgradeV6Test
 * @notice Deploys the v6 config table against a local stack, on both chains it supports.
 * @dev Nothing here checks the VALUES are the ones we want -- that is a review question, and the
 *      comments in `_config()` carry the v5 comparison for it. What this checks is that the table
 *      is internally consistent and deployable: that the constructors accept it, and that `verify()`
 *      reads every value back off the deployed contracts. Those are the failures that would
 *      otherwise surface on deploy day, against mainnet, with a broadcast in flight.
 */
contract DeployRollupForUpgradeV6Test is Test {
  using stdJson for string;

  uint256 internal constant MAINNET_CHAIN_ID = 1;
  uint256 internal constant SEPOLIA_CHAIN_ID = 11_155_111;

  /// @dev Where the v5 flush rewarder lives on mainnet, per the config table.
  address internal constant MAINNET_OLD_FLUSH_REWARDER = 0x5B98cA4dcE7b59CCf241D12f81d3d2eCF14e410e;

  Registry internal registry;
  Rollup internal outgoing;

  modifier skipWhenCoverage() {
    if (vm.envOr("FORGE_COVERAGE", false)) {
      vm.skip(true);
    }
    _;
  }

  function setUp() public skipWhenCoverage {
    _loadNetworkDefaults();

    DeployAztecL1Contracts fullDeploy = new DeployAztecL1Contracts();
    fullDeploy.run();

    DeployAztecL1ContractsOutput memory out = fullDeploy.output();
    registry = out.registry;
    outgoing = out.rollup.rollup;

    vm.setEnv("REGISTRY_ADDRESS", vm.toString(address(registry)));

    // Registry ownership stays with the real Governance. The script never writes to the registry --
    // it reads the outgoing rollup off it and hands registration to the payload -- and `run()`
    // finishes by driving that payload through the real governance lifecycle, which needs
    // `getGovernance()` to actually be a Governance contract.
  }

  function test_MainnetConfigDeploysAndVerifies() public {
    vm.chainId(MAINNET_CHAIN_ID);
    _placeOutgoingFlushRewarder();

    V6ConfigHarness harness = new V6ConfigHarness();
    harness.run();

    Rollup deployed = harness.deployedRollup();
    assertNotEq(address(deployed), address(outgoing), "deployed the outgoing rollup");

    // `run()` already calls these, but calling them again from the test is what pins that they are
    // callable stand-alone -- which is how the runbook tells an operator to re-check a deploy.
    harness.verify(address(deployed));
    harness.verifyFlushRewarder(address(deployed), address(harness.deployedPayload()));
  }

  function test_SepoliaConfigDeploysAndVerifies() public {
    vm.chainId(SEPOLIA_CHAIN_ID);
    // No rewarder to place: Sepolia's override sets `oldFlushRewarder` to zero, and the payload
    // skips the migration entirely.

    V6ConfigHarness harness = new V6ConfigHarness();
    harness.run();

    Rollup deployed = harness.deployedRollup();
    harness.verify(address(deployed));

    V6UpgradePayload payload = harness.deployedPayload();
    assertEq(address(payload.OLD_FLUSH_REWARDER()), address(0), "sepolia should have no old rewarder");
    assertEq(address(payload.NEW_FLUSH_REWARDER()), address(0), "sepolia should deploy no new rewarder");
    assertFalse(payload.ENFORCE_EXECUTION_WINDOW(), "sepolia should not enforce the window");
  }

  /// @dev The Rollup constructor's `_governance` becomes BOTH the Ownable owner and the Slasher's
  ///      immutable GOVERNANCE, which may execute any slash payload with no vote. Ownership is
  ///      handed over after construction; the Slasher's copy cannot be.
  function test_SlasherGovernanceIsGovernanceNotTheDeployer() public {
    vm.chainId(MAINNET_CHAIN_ID);
    _placeOutgoingFlushRewarder();

    V6ConfigHarness harness = new V6ConfigHarness();
    harness.run();
    Rollup deployed = harness.deployedRollup();

    address slasherGov = Slasher(deployed.getSlasher()).GOVERNANCE();
    emit log_named_address("slasher GOVERNANCE", slasherGov);
    emit log_named_address("rollup owner       ", deployed.owner());
    emit log_named_address("registry governance", registry.getGovernance());
    emit log_named_address("deployer (this)    ", address(harness));

    assertEq(slasherGov, registry.getGovernance(), "slasher GOVERNANCE is not governance");
  }

  function test_UnsupportedChainReverts() public {
    vm.chainId(31_337);
    V6ConfigHarness harness = new V6ConfigHarness();
    vm.expectRevert(
      abi.encodeWithSelector(DeployRollupForUpgradeV6.DeployRollupForUpgradeV6__UnsupportedChain.selector, 31_337)
    );
    harness.run();
  }

  /// @dev The script must refuse to deploy while the genesis roots are unset. The real table now
  ///      carries them, so the zero case is constructed rather than read off it.
  function test_RefusesWhileGenesisRootsAreZero() public {
    vm.chainId(MAINNET_CHAIN_ID);
    V6ZeroRootsHarness zeroed = new V6ZeroRootsHarness();
    vm.expectRevert(bytes("vkTreeRoot not set"));
    zeroed.run();
  }

  // -----------------------------------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------------------------------

  /**
   * @dev Put a flush rewarder bound to the outgoing rollup at the mainnet address the config names.
   *      Etched rather than deployed: the address is a literal in the table, and the point is to
   *      exercise the table as written rather than a version of it with the address swapped out.
   *      Immutables live in the runtime code so ROLLUP and REWARD_ASSET survive the etch; storage
   *      does not, so `rewardPerInsertion` reads zero, which the payload simply mirrors.
   */
  function _placeOutgoingFlushRewarder() internal {
    FlushRewarder template = new FlushRewarder(
      registry.getGovernance(), IInstance(address(outgoing)), IERC20(address(outgoing.getStakingAsset())), 0
    );
    vm.etch(MAINNET_OLD_FLUSH_REWARDER, address(template).code);
    assertEq(
      address(FlushRewarder(MAINNET_OLD_FLUSH_REWARDER).ROLLUP()), address(outgoing), "etched rewarder is not bound"
    );
  }

  function _loadNetworkDefaults() internal {
    string memory json = vm.readFile(string.concat(vm.projectRoot(), "/scripts/network-defaults.json"));

    // The GSE thresholds are the one part of the v6 table that is NOT set by the deploy -- they are
    // asserted against the GSE that already exists, because the new rollup inherits it. The local
    // stack's defaults are 100e18/50e18, so they are raised to production values here; otherwise
    // the test would have to weaken that assertion, which is one of the few in the script that
    // catches a rollup pointed at the wrong GSE.
    vm.setEnv("AZTEC_ACTIVATION_THRESHOLD", vm.toString(uint256(200_000e18)));
    vm.setEnv("AZTEC_EJECTION_THRESHOLD", vm.toString(uint256(100_000e18)));

    vm.setEnv("ETHEREUM_SLOT_DURATION", vm.toString(json.readUint(".ETHEREUM_SLOT_DURATION")));
    vm.setEnv("AZTEC_SLOT_DURATION", vm.toString(json.readUint(".AZTEC_SLOT_DURATION")));
    vm.setEnv("AZTEC_EPOCH_DURATION", vm.toString(json.readUint(".AZTEC_EPOCH_DURATION")));
    vm.setEnv("AZTEC_PROOF_SUBMISSION_EPOCHS", vm.toString(json.readUint(".AZTEC_PROOF_SUBMISSION_EPOCHS")));
    vm.setEnv("AZTEC_TARGET_COMMITTEE_SIZE", vm.toString(json.readUint(".AZTEC_TARGET_COMMITTEE_SIZE")));
    vm.setEnv(
      "AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET", vm.toString(json.readUint(".AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET"))
    );
    vm.setEnv("AZTEC_LAG_IN_EPOCHS_FOR_RANDAO", vm.toString(json.readUint(".AZTEC_LAG_IN_EPOCHS_FOR_RANDAO")));
    vm.setEnv("AZTEC_LOCAL_EJECTION_THRESHOLD", json.readString(".AZTEC_LOCAL_EJECTION_THRESHOLD"));
    vm.setEnv("AZTEC_EXIT_DELAY_SECONDS", vm.toString(json.readUint(".AZTEC_EXIT_DELAY_SECONDS")));
    vm.setEnv(
      "AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE",
      vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE"))
    );
    vm.setEnv(
      "AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE", vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE"))
    );
    vm.setEnv("AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN", vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN")));
    vm.setEnv(
      "AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT", vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT"))
    );
    vm.setEnv("AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE", vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE")));
    vm.setEnv("AZTEC_MANA_TARGET", vm.toString(json.readUint(".AZTEC_MANA_TARGET")));
    vm.setEnv("AZTEC_PROVING_COST_PER_MANA", vm.toString(json.readUint(".AZTEC_PROVING_COST_PER_MANA")));
    vm.setEnv("AZTEC_INITIAL_ETH_PER_FEE_ASSET", vm.toString(json.readUint(".AZTEC_INITIAL_ETH_PER_FEE_ASSET")));
    vm.setEnv("AZTEC_REGISTRY_REWARD_OVERRIDE_0", json.readString(".AZTEC_REGISTRY_REWARD_OVERRIDE_0"));
    vm.setEnv("AZTEC_REGISTRY_REWARD_OVERRIDE_1", json.readString(".AZTEC_REGISTRY_REWARD_OVERRIDE_1"));
    vm.setEnv("AZTEC_SLASHER_ENABLED", vm.toString(json.readBool(".AZTEC_SLASHER_ENABLED")));
    vm.setEnv("AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS", vm.toString(json.readUint(".AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS")));
    vm.setEnv("AZTEC_SLASHING_OFFSET_IN_ROUNDS", vm.toString(json.readUint(".AZTEC_SLASHING_OFFSET_IN_ROUNDS")));
    vm.setEnv("AZTEC_SLASHING_LIFETIME_IN_ROUNDS", vm.toString(json.readUint(".AZTEC_SLASHING_LIFETIME_IN_ROUNDS")));
    vm.setEnv(
      "AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS",
      vm.toString(json.readUint(".AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS"))
    );
    vm.setEnv("AZTEC_SLASHING_DISABLE_DURATION", vm.toString(json.readUint(".AZTEC_SLASHING_DISABLE_DURATION")));
    vm.setEnv("AZTEC_SLASHING_VETOER", json.readString(".AZTEC_SLASHING_VETOER"));
    vm.setEnv("AZTEC_SLASH_AMOUNT_SMALL", json.readString(".AZTEC_SLASH_AMOUNT_SMALL"));
    vm.setEnv("AZTEC_SLASH_AMOUNT_MEDIUM", json.readString(".AZTEC_SLASH_AMOUNT_MEDIUM"));
    vm.setEnv("AZTEC_SLASH_AMOUNT_LARGE", json.readString(".AZTEC_SLASH_AMOUNT_LARGE"));
  }
}
