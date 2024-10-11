// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {INomismatokopio} from "@aztec/governance/interfaces/INomismatokopio.sol";

contract Nomismatokopio is INomismatokopio, Ownable {
  IMintableERC20 public immutable ASSET;
  uint256 public immutable RATE;
  uint256 public timeOfLastMint;

  constructor(IMintableERC20 _asset, uint256 _rate, address _owner) Ownable(_owner) {
    ASSET = _asset;
    RATE = _rate;
    timeOfLastMint = block.timestamp;
  }

  /**
   * @notice  Mint tokens up to the `mintAvailable` limit
   *          Beware that the mintAvailable will be reset to 0, and not just
   *          reduced by the amount minted.
   *
   * @param _to - The address to receive the funds
   * @param _amount - The amount to mint
   */
  function mint(address _to, uint256 _amount) external override(INomismatokopio) onlyOwner {
    uint256 maxMint = mintAvailable();
    require(_amount <= maxMint, Errors.Nomismatokopio__InssuficientMintAvailable(maxMint, _amount));
    timeOfLastMint = block.timestamp;
    ASSET.mint(_to, _amount);
  }

  /**
   * @notice  The amount of funds that is available for "minting"
   *
   * @return The amount mintable
   */
  function mintAvailable() public view override(INomismatokopio) returns (uint256) {
    return RATE * (block.timestamp - timeOfLastMint);
  }
}
