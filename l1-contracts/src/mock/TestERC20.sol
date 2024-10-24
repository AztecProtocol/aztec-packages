// SPDX-License-Identifier: Apache-2.0
// docs:start:contract
pragma solidity >=0.8.27;

import {ERC20} from "@oz/token/ERC20/ERC20.sol";
import {IMintableERC20} from "../governance/interfaces/IMintableERC20.sol";

contract TestERC20 is ERC20, IMintableERC20 {
  constructor() ERC20("Portal", "PORTAL") {}

  function mint(address _to, uint256 _amount) external override(IMintableERC20) {
    _mint(_to, _amount);
  }
}
// docs:end:contract
