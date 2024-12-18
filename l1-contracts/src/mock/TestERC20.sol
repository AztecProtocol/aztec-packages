// SPDX-License-Identifier: Apache-2.0
// docs:start:contract
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {ERC20} from "@oz/token/ERC20/ERC20.sol";
import {IMintableERC20} from "./../governance/interfaces/IMintableERC20.sol";

contract TestERC20 is ERC20, IMintableERC20, Ownable {
  bool public freeForAll = false;

  modifier ownerOrFreeForAll() {
    if (msg.sender != owner() && !freeForAll) {
      revert("Not owner or free for all");
    }
    _;
  }

  constructor(string memory _name, string memory _symbol, address _owner)
    ERC20(_name, _symbol)
    Ownable(_owner)
  {}

  // solhint-disable-next-line comprehensive-interface
  function setFreeForAll(bool _freeForAll) external onlyOwner {
    freeForAll = _freeForAll;
  }

  function mint(address _to, uint256 _amount) external override(IMintableERC20) ownerOrFreeForAll {
    _mint(_to, _amount);
  }
}
// docs:end:contract
