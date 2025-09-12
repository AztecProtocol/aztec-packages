// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {TestGov} from "@test/governance/helpers/TestGov.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract OddERC20 is TestERC20 {
  constructor(string memory _name, string memory _symbol, address _owner) TestERC20(_name, _symbol, _owner) {}

  function _spendAllowance(address owner, address spender, uint256 value) internal virtual override {
    if (owner == msg.sender) {
      return;
    }
    super._spendAllowance(owner, spender, value);
  }
}

contract DepositTest is TestBase {
  IMintableERC20 internal token;
  Registry internal registry;
  Governance internal governance;
  GovernanceProposer internal governanceProposer;

  function setUp() public {
    token = IMintableERC20(address(new OddERC20("test", "TEST", address(this))));

    registry = new Registry(address(this), token);
    governanceProposer = new GovernanceProposer(registry, IGSE(address(0x03)), 677, 1000);

    governance =
      new TestGov(token, address(governanceProposer), address(this), TestConstants.getGovernanceConfiguration());
  }

  function test_when_calling_self() public {
    vm.prank(address(governance));
    governance.openFloodgates();

    uint256 amount = 1000e18;
    token.mint(address(this), amount);
    token.approve(address(governance), amount);

    governance.deposit(address(this), amount);
    assertEq(token.balanceOf(address(governance)), amount);

    vm.prank(address(governance));
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__CallerCannotBeSelf.selector, address(governance)));
    governance.deposit(address(governance), amount);

    assertEq(governance.powerNow(address(governance)), 0);
  }
}
