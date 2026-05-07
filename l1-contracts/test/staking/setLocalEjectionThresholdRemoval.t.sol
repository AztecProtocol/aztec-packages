// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";

/**
 * @notice The `setLocalEjectionThreshold(uint256)` selector is no longer reachable on the
 *         deployed rollup. The threshold is still readable via {getLocalEjectionThreshold} but
 *         can only be set in the rollup constructor -- never mutated after deployment.
 */
contract SetLocalEjectionThresholdRemovalTest is StakingBase {
  function test_setLocalEjectionThresholdSelectorIsUnreachable() external {
    // The selector was removed from IStakingCore. A low-level call with the old selector hits
    // the missing-fallback path and reverts. We prank as the owner because that was the only
    // caller that could have exercised it (the function was `onlyOwner`).
    bytes4 removedSelector = bytes4(keccak256("setLocalEjectionThreshold(uint256)"));
    vm.prank(address(this));
    (bool ok,) = address(staking).call(abi.encodeWithSelector(removedSelector, uint256(1)));
    assertFalse(ok, "setLocalEjectionThreshold selector must not be reachable on the rollup");
  }

  function test_localEjectionThresholdRemainsReadable() external view {
    staking.getLocalEjectionThreshold();
  }
}
