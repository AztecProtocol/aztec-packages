// SPDX-License-Identifier: Apache-2.0
// docs:start:contract
pragma solidity >=0.8.27;

import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {ERC20} from "@oz/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20, IMintableERC20, Ownable {
  mapping(address minter => bool isMinter) public minters;

  modifier onlyMinter() {
    require(minters[msg.sender], NotMinter(msg.sender));
    _;
  }

  constructor(string memory _name, string memory _symbol, address _owner)
    ERC20(_name, _symbol)
    Ownable(_owner)
  {
    minters[_owner] = true;
    emit MinterAdded(_owner);
  }

  function mint(address _to, uint256 _amount) external override(IMintableERC20) onlyMinter {
    _mint(_to, _amount);
  }

  function addMinter(address _minter) public override(IMintableERC20) onlyOwner {
    minters[_minter] = true;
    emit MinterAdded(_minter);
  }

  function removeMinter(address _minter) public override(IMintableERC20) onlyOwner {
    minters[_minter] = false;
    emit MinterRemoved(_minter);
  }

  function transferOwnership(address _newOwner) public override(Ownable) onlyOwner {
    if (_newOwner == address(0)) {
      revert OwnableInvalidOwner(address(0));
    }
    removeMinter(owner());
    addMinter(_newOwner);
    _transferOwnership(_newOwner);
  }
}
// docs:end:contract
