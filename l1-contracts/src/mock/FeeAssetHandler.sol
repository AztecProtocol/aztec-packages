// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";

interface IFeeAssetHandler {
  event MintAmountSet(uint256 amount);

  function mint(address _recipient) external;
  function setMintAmount(uint256 _amount) external;
}

contract FeeAssetHandler is IFeeAssetHandler, Ownable {
  IMintableERC20 public immutable FEE_ASSET;
  uint256 public mintAmount;

  constructor(address _owner, address _feeAsset, uint256 _mintAmount) Ownable(_owner) {
    FEE_ASSET = IMintableERC20(_feeAsset);
    mintAmount = _mintAmount;
  }

  function mint(address _recipient) external override(IFeeAssetHandler) {
    FEE_ASSET.mint(_recipient, mintAmount);
  }

  function setMintAmount(uint256 _amount) external override(IFeeAssetHandler) onlyOwner {
    mintAmount = _amount;
    emit MintAmountSet(_amount);
  }
}
