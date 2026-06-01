// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {RewardDistributorBase, FakeRollup} from "./Base.t.sol";

import {Ownable} from "@oz/access/Ownable.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

// Cross-cutting accounting identities for RewardDistributor:
//
//   ASSET.balanceOf(distributor) >= totalEarmarkedBalance              // never under-collateralized
//   sum_over_rollups(specificRecipientBalance) == totalEarmarkedBalance
//   availableTo(canonical) == (balance - totalEarmarked) + specificRecipientBalance[canonical]
//
// Defended both by a deterministic mixed-op test and a stateful fuzz handler.

contract IdentityTest is RewardDistributorBase {
  address internal owner;
  address internal canonical;

  function setUp() public override {
    super.setUp();
    owner = Ownable(address(registry)).owner();
    canonical = address(registry.getCanonicalRollup());
  }

  function test_balanceIdentity_holdsAfterMixedOps(address _r1) external {
    vm.assume(_r1 != canonical && _r1 != address(0));
    address funder = makeAddr("funder");

    uint256 s1 = 19e18;
    uint256 sc = 23e18;
    token.mint(funder, s1 + sc);
    vm.prank(funder);
    token.approve(address(rewardDistributor), s1 + sc);
    vm.prank(funder);
    rewardDistributor.subsidizeAddress(_r1, s1);
    vm.prank(funder);
    rewardDistributor.subsidizeAddress(canonical, sc);

    uint256 unearmarked = 7e18;
    token.mint(address(rewardDistributor), unearmarked);
    _assertIdentity(_r1);

    vm.prank(_r1);
    rewardDistributor.claim(_r1, 5e18);
    _assertIdentity(_r1);

    // Canonical claim that dips into earmarked.
    vm.prank(canonical);
    rewardDistributor.claim(canonical, unearmarked + 3e18);
    _assertIdentity(_r1);

    vm.prank(owner);
    rewardDistributor.recoverFrom(canonical, owner, 4e18);
    _assertIdentity(_r1);

    vm.prank(owner);
    rewardDistributor.recoverFrom(_r1, owner, 2e18);
    _assertIdentity(_r1);
  }

  function _assertIdentity(address _r1) internal view {
    uint256 balance = token.balanceOf(address(rewardDistributor));
    uint256 total = rewardDistributor.totalEarmarkedBalance();
    assertGe(balance, total, "balance must cover totalEarmarked");
    uint256 sumSpecific =
      rewardDistributor.specificRecipientBalance(_r1) + rewardDistributor.specificRecipientBalance(canonical);
    assertEq(sumSpecific, total, "sum of tracked specifics == totalEarmarked");
    uint256 canonicalAvail = rewardDistributor.availableTo(canonical);
    assertEq(
      canonicalAvail, balance - total + rewardDistributor.specificRecipientBalance(canonical), "canonical available"
    );
  }
}

// Stateful fuzz Handler. Pre-allocates a small set of rollup addresses so random call
// sequences reach overlapping state (subsidize/claim/recover all targeting the same rollup).
contract RewardDistributorHandler is Test {
  RewardDistributor public distributor;
  IMintableERC20 public token;
  Registry public registry;
  address public owner;

  address[] public rollups;
  address[] public knownRollups;
  mapping(address => bool) internal seen;

  uint256 internal constant MAX_AMOUNT = 1_000_000e18;

  constructor(
    RewardDistributor _distributor,
    IMintableERC20 _token,
    Registry _registry,
    address _owner,
    address _initialCanonical
  ) {
    distributor = _distributor;
    token = _token;
    registry = _registry;
    owner = _owner;
    rollups.push(_initialCanonical);
    _track(_initialCanonical);
  }

  function _track(address _r) internal {
    if (_r == address(0)) return;
    if (seen[_r]) return;
    seen[_r] = true;
    knownRollups.push(_r);
  }

  function _pickRollup(uint256 _seed) internal view returns (address) {
    if (rollups.length == 0) return address(0);
    return rollups[_seed % rollups.length];
  }

  function subsidize(uint256 _seed, uint256 _amount) external {
    address r = _pickRollup(_seed);
    if (r == address(0)) return;
    uint256 amount = bound(_amount, 0, MAX_AMOUNT);
    if (amount == 0) {
      distributor.subsidizeAddress(r, 0);
      _track(r);
      return;
    }
    token.mint(address(this), amount);
    token.approve(address(distributor), amount);
    distributor.subsidizeAddress(r, amount);
    _track(r);
  }

  function claim(uint256 _seed, uint256 _amount) external {
    address r = _pickRollup(_seed);
    if (r == address(0)) return;
    uint256 avail = distributor.availableTo(r);
    if (avail == 0) return;
    uint256 amount = bound(_amount, 0, avail);
    vm.prank(r);
    distributor.claim(address(0xbeef), amount);
  }

  function recover(uint256 _seed, uint256 _amount) external {
    address r = _pickRollup(_seed);
    if (r == address(0)) return;
    uint256 avail = distributor.availableTo(r);
    if (avail == 0) return;
    uint256 amount = bound(_amount, 0, avail);
    vm.prank(owner);
    distributor.recoverFrom(r, address(0xdead), amount);
  }

  // Drop ASSET into the contract via plain mint (the `direct transfer` case).
  function donate(uint256 _amount) external {
    uint256 amount = bound(_amount, 0, MAX_AMOUNT);
    token.mint(address(distributor), amount);
  }

  function rotate() external {
    FakeRollup nr = new FakeRollup();
    address newRollup = address(nr);
    vm.prank(owner);
    registry.addRollup(IRollup(newRollup));
    rollups.push(newRollup);
    _track(newRollup);
  }

  function knownRollupsLength() external view returns (uint256) {
    return knownRollups.length;
  }
}

contract RewardDistributorInvariantTest is RewardDistributorBase {
  RewardDistributorHandler internal handler;

  function setUp() public override {
    super.setUp();
    address owner = Ownable(address(registry)).owner();
    address canonical = address(registry.getCanonicalRollup());

    handler = new RewardDistributorHandler(rewardDistributor, token, registry, owner, canonical);

    // The handler needs to mint TestERC20 so that subsidize/donate exercise real balance changes.
    token.addMinter(address(handler));

    targetContract(address(handler));

    bytes4[] memory sels = new bytes4[](5);
    sels[0] = handler.subsidize.selector;
    sels[1] = handler.claim.selector;
    sels[2] = handler.recover.selector;
    sels[3] = handler.donate.selector;
    sels[4] = handler.rotate.selector;
    targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
  }

  // A violation here means a `claim`/`recover` underflowed or some path exfiltrated
  // more ASSET than the accounting accepted.
  function invariant_balanceCoversEarmarked() external view {
    assertGe(token.balanceOf(address(rewardDistributor)), rewardDistributor.totalEarmarkedBalance());
  }

  // Catches double-debiting or missed-debiting bugs in `_transfer`.
  function invariant_sumSpecificEqualsTotal() external view {
    uint256 sum = 0;
    uint256 n = handler.knownRollupsLength();
    for (uint256 i = 0; i < n; i++) {
      sum += rewardDistributor.specificRecipientBalance(handler.knownRollups(i));
    }
    assertEq(sum, rewardDistributor.totalEarmarkedBalance());
  }

  // The headline behavioural promise of the canonical inheritance design.
  function invariant_canonicalAvailableMatchesIdentity() external view {
    address canonical = rewardDistributor.canonicalRollup();
    uint256 expected =
      token.balanceOf(address(rewardDistributor)) - rewardDistributor.totalEarmarkedBalance()
      + rewardDistributor.specificRecipientBalance(canonical);
    assertEq(rewardDistributor.availableTo(canonical), expected);
  }
}
