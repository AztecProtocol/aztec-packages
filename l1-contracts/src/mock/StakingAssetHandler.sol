// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";

import {IStaking} from "./../core/interfaces/IStaking.sol";
import {IMintableERC20} from "./../governance/interfaces/IMintableERC20.sol";

/**
 * @title StakingAssetHandler
 * @notice This contract is used as a faucet for creating validators.
 *
 * It allows for anyone with the `canAddValidator` role to add validators to the rollup,
 * caveat being that it controls the number of validators that can be added in a time period.
 *
 * @dev For example, if minMintInterval is 60*60 and maxDepositsPerMint is 3,
 *      then *generally* 3 validators can be added every hour.
 *      NB: it is possible to add 1 validator at the top of the hour, and 2 validators
 *      at the very end of the hour, then 3 validators at the top of the next hour
 *      so the maximum "burst" rate is effectively twice the maxDepositsPerMint.
 *
 * @dev This contract must be a minter of the staking asset.
 *
 * @dev Only the owner can grant and revoke the `canAddValidator` role, and perform other administrative tasks
 *      such as setting the rollup, deposit amount, min mint interval, max deposits per mint, and withdrawer.
 *
 */
interface IStakingAssetHandler {
  event ToppedUp(uint256 _amount);
  event ValidatorAdded(
    address indexed _attester, address indexed _proposer, address indexed _withdrawer
  );
  event RollupUpdated(address indexed _rollup);
  event DepositAmountUpdated(uint256 _depositAmount);
  event IntervalUpdated(uint256 _interval);
  event DepositsPerMintUpdated(uint256 _depositsPerMint);
  event WithdrawerUpdated(address indexed _withdrawer);
  event AddValidatorPermissionGranted(address indexed _address);
  event AddValidatorPermissionRevoked(address indexed _address);

  error NotCanAddValidator(address _caller);
  error NotEnoughTimeSinceLastMint(uint256 _lastMintTimestamp, uint256 _minMintInterval);
  error CannotMintZeroAmount();
  error MaxDepositsTooLarge(uint256 _depositAmount, uint256 _maxDepositsPerMint);

  function addValidator(address _attester, address _proposer) external;
  function setRollup(address _rollup) external;
  function setDepositAmount(uint256 _amount) external;
  function setMintInterval(uint256 _interval) external;
  function setDepositsPerMint(uint256 _depositsPerMint) external;
  function setWithdrawer(address _withdrawer) external;
  function grantAddValidatorPermission(address _address) external;
  function revokeAddValidatorPermission(address _address) external;
}

contract StakingAssetHandler is IStakingAssetHandler, Ownable {
  IMintableERC20 public immutable STAKING_ASSET;

  mapping(address => bool) public canAddValidator;

  uint256 public depositAmount;
  uint256 public lastMintTimestamp;
  uint256 public mintInterval;
  uint256 public depositsPerMint;

  IStaking public rollup;
  address public withdrawer;

  modifier onlyCanAddValidator() {
    require(canAddValidator[msg.sender], NotCanAddValidator(msg.sender));
    _;
  }

  constructor(
    address _owner,
    address _stakingAsset,
    address _rollup,
    address _withdrawer,
    uint256 _depositAmount,
    uint256 _mintInterval,
    uint256 _depositsPerMint,
    address[] memory _canAddValidator
  ) Ownable(_owner) {
    require(_depositsPerMint > 0, CannotMintZeroAmount());

    STAKING_ASSET = IMintableERC20(_stakingAsset);

    rollup = IStaking(_rollup);
    emit RollupUpdated(_rollup);

    withdrawer = _withdrawer;
    emit WithdrawerUpdated(_withdrawer);

    depositAmount = _depositAmount;
    emit DepositAmountUpdated(_depositAmount);

    mintInterval = _mintInterval;
    emit IntervalUpdated(_mintInterval);

    depositsPerMint = _depositsPerMint;
    emit DepositsPerMintUpdated(_depositsPerMint);

    for (uint256 i = 0; i < _canAddValidator.length; i++) {
      canAddValidator[_canAddValidator[i]] = true;
      emit AddValidatorPermissionGranted(_canAddValidator[i]);
    }
    canAddValidator[_owner] = true;
    emit AddValidatorPermissionGranted(_owner);
  }

  function addValidator(address _attester, address _proposer)
    external
    override(IStakingAssetHandler)
    onlyCanAddValidator
  {
    bool needsToMint = STAKING_ASSET.balanceOf(address(this)) < depositAmount;
    bool canMint = block.timestamp - lastMintTimestamp >= mintInterval;

    require(!needsToMint || canMint, NotEnoughTimeSinceLastMint(lastMintTimestamp, mintInterval));
    if (needsToMint) {
      STAKING_ASSET.mint(address(this), depositAmount * depositsPerMint);
      lastMintTimestamp = block.timestamp;
      emit ToppedUp(depositAmount * depositsPerMint);
    }

    STAKING_ASSET.approve(address(rollup), depositAmount);
    rollup.deposit(_attester, _proposer, withdrawer, depositAmount);
    emit ValidatorAdded(_attester, _proposer, withdrawer);
  }

  function setRollup(address _rollup) external override(IStakingAssetHandler) onlyOwner {
    rollup = IStaking(_rollup);
    emit RollupUpdated(_rollup);
  }

  function setDepositAmount(uint256 _amount) external override(IStakingAssetHandler) onlyOwner {
    depositAmount = _amount;
    emit DepositAmountUpdated(_amount);
  }

  function setMintInterval(uint256 _interval) external override(IStakingAssetHandler) onlyOwner {
    mintInterval = _interval;
    emit IntervalUpdated(_interval);
  }

  function setDepositsPerMint(uint256 _depositsPerMint)
    external
    override(IStakingAssetHandler)
    onlyOwner
  {
    require(_depositsPerMint > 0, CannotMintZeroAmount());
    depositsPerMint = _depositsPerMint;
    emit DepositsPerMintUpdated(_depositsPerMint);
  }

  function setWithdrawer(address _withdrawer) external override(IStakingAssetHandler) onlyOwner {
    withdrawer = _withdrawer;
    emit WithdrawerUpdated(_withdrawer);
  }

  function grantAddValidatorPermission(address _address)
    external
    override(IStakingAssetHandler)
    onlyOwner
  {
    canAddValidator[_address] = true;
    emit AddValidatorPermissionGranted(_address);
  }

  function revokeAddValidatorPermission(address _address)
    external
    override(IStakingAssetHandler)
    onlyOwner
  {
    canAddValidator[_address] = false;
    emit AddValidatorPermissionRevoked(_address);
  }
}
