// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {ZKPassportVerifier, ProofVerificationParams} from "@zkpassport/ZKPassportVerifier.sol";

import {QueueLib, Queue} from "./staking_asset_handler/Queue.sol";
/**
 * @title StakingAssetHandler
 * @notice This contract is used as a faucet for creating validators.
 *
 * It allows anyone to join the queue to be a validator to the rollup.
 * Validators get added to the queue, then each day `dripQueue` can be called including
 * up to `depositsPerMint` validators per day.
 * With the caveat that the contract can mint itself funds to cover adding `depositsPerMint`
 * validators per `mintInterval` unit of time.
 *
 * @dev For example, if minMintInterval is 60*60 and maxDepositsPerMint is 3,
 *      then *generally* 3 validators can be added every hour.
 *      NB: it is possible to add 1 validator at the top of the hour, and 2 validators
 *      at the very end of the hour, then 3 validators at the top of the next hour
 *      so the maximum "burst" rate is effectively twice the maxDepositsPerMint.
 *
 * @dev This contract must be a minter of the staking asset - or have a big balance.
 *
 * @dev Only the owner can grant and revoke the `isUnhinged` role, and perform other administrative tasks
 *      such as setting the REGISTRY address, mint interval, deposits per mint, and withdrawer.
 */

interface IStakingAssetHandler {
  event ToppedUp(uint256 _amount);
  event AddedToQueue(address indexed _attester);
  event ValidatorAdded(address indexed _rollup, address indexed _attester, address _withdrawer);
  event IntervalUpdated(uint256 _interval);
  event DepositsPerMintUpdated(uint256 _depositsPerMint);
  event WithdrawerUpdated(address indexed _withdrawer);
  event ZKPassportVerifierUpdated(address indexed _verifier);
  event ScopeUpdated(string newScope);
  event SubScopeUpdated(string newSubScope);

  event UnhingedAdded(address indexed _address);
  event UnhingedRemoved(address indexed _address);

  error CannotMintZeroAmount();
  error ValidatorQuotaFilledUntil(uint256 _timestamp);
  error InvalidProof();
  error SybilDetected(bytes32 _nullifier);

  function addValidatorToQueue(address _attester, ProofVerificationParams memory _params) external;
  function setMintInterval(uint256 _interval) external;
  function setDepositsPerMint(uint256 _depositsPerMint) external;
  function setWithdrawer(address _withdrawer) external;
  function addUnhinged(address _address) external;
  function removeUnhinged(address _address) external;
  function setZKPassportVerifier(address _address) external;
  function setScope(string memory _scope) external;
  function setSubscope(string memory _subscope) external;
  function getQueueLength() external returns (uint256);
  function dripQueue() external;

  function getRollup() external view returns (address);
}

contract StakingAssetHandler is IStakingAssetHandler, Ownable {
  using QueueLib for Queue;

  IMintableERC20 public immutable STAKING_ASSET;
  IRegistry public immutable REGISTRY;

  ZKPassportVerifier public zkPassportVerifier;

  mapping(address => bool) public isUnhinged;
  mapping(bytes32 => bool) public nullifiers;

  uint256 public lastMintTimestamp;
  uint256 public mintInterval;
  uint256 public depositsPerMint;

  address public withdrawer;

  Queue private entryQueue;

  string public validScope;
  string public validSubscope;

  constructor(
    address _owner,
    address _stakingAsset,
    IRegistry _registry,
    address _withdrawer,
    uint256 _mintInterval,
    uint256 _depositsPerMint,
    ZKPassportVerifier _zkPassportVerifier,
    address[] memory _unhinged
  ) Ownable(_owner) {
    require(_depositsPerMint > 0, CannotMintZeroAmount());

    STAKING_ASSET = IMintableERC20(_stakingAsset);
    REGISTRY = _registry;

    withdrawer = _withdrawer;
    emit WithdrawerUpdated(_withdrawer);

    mintInterval = _mintInterval;
    emit IntervalUpdated(_mintInterval);

    depositsPerMint = _depositsPerMint;
    emit DepositsPerMintUpdated(_depositsPerMint);

    for (uint256 i = 0; i < _unhinged.length; i++) {
      isUnhinged[_unhinged[i]] = true;
      emit UnhingedAdded(_unhinged[i]);
    }
    isUnhinged[_owner] = true;
    emit UnhingedAdded(_owner);

    zkPassportVerifier = _zkPassportVerifier;
    emit ZKPassportVerifierUpdated(address(_zkPassportVerifier));

    validScope = "sequencer.alpha-testnet.aztec.network";
    validSubscope = "personhood";

    entryQueue.init();
  }

  /**
   * Add a validator attester proposer pair into the deposit queue
   *
   * @param _attester - the validator's attester address
   */
  function addValidatorToQueue(address _attester, ProofVerificationParams calldata _params)
    external
    override(IStakingAssetHandler)
  {
    // If the sender is unhinged, will mint the required amount (to not impact other users).
    // Otherwise we add them to the deposit queue.
    if (isUnhinged[msg.sender]) {
      IStaking rollup = IStaking(address(REGISTRY.getCanonicalRollup()));
      uint256 depositAmount = rollup.getMinimumStake();

      STAKING_ASSET.mint(address(this), depositAmount);

      _triggerDeposit(rollup, depositAmount, _attester);
    } else {
      _validatePassportProof(_attester, _params);
    }
  }

  function dripQueue() external override(IStakingAssetHandler) {
    IStaking rollup = IStaking(address(REGISTRY.getCanonicalRollup()));
    uint256 depositAmount = rollup.getMinimumStake();
    uint256 balance = STAKING_ASSET.balanceOf(address(this));

    // If we do not have enough balance, check if we can refill the quota
    if (balance < depositAmount) {
      require(
        block.timestamp - lastMintTimestamp >= mintInterval,
        ValidatorQuotaFilledUntil(lastMintTimestamp + mintInterval)
      );
      STAKING_ASSET.mint(address(this), depositAmount * depositsPerMint);
      lastMintTimestamp = block.timestamp;
      emit ToppedUp(depositAmount * depositsPerMint);
    }

    // Now that we have balance on the staking asset, for as many deposits that we have, we will empty the queue
    uint256 updatedBalance = STAKING_ASSET.balanceOf(address(this));
    uint256 mintsAvailable = updatedBalance / depositAmount; // (integer division)

    uint256 queueLength = entryQueue.length();

    // if the queue is smaller then lets empty the queue, otherwise drip as many deposits as we have balance for
    uint256 depositsToMake = (queueLength < mintsAvailable) ? queueLength : mintsAvailable;

    for (uint256 i = 0; i < depositsToMake; ++i) {
      address attester = entryQueue.dequeue();
      _triggerDeposit(rollup, depositAmount, attester);
    }
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

  function setZKPassportVerifier(address _zkPassportVerifier)
    external
    override(IStakingAssetHandler)
    onlyOwner
  {
    zkPassportVerifier = ZKPassportVerifier(_zkPassportVerifier);
    emit ZKPassportVerifierUpdated(_zkPassportVerifier);
  }

  function setScope(string memory _scope) external override(IStakingAssetHandler) onlyOwner {
    validScope = _scope;
    emit ScopeUpdated(_scope);
  }

  function setSubscope(string memory _subscope) external override(IStakingAssetHandler) onlyOwner {
    validSubscope = _subscope;
    emit SubScopeUpdated(_subscope);
  }

  function setWithdrawer(address _withdrawer) external override(IStakingAssetHandler) onlyOwner {
    withdrawer = _withdrawer;
    emit WithdrawerUpdated(_withdrawer);
  }

  function addUnhinged(address _address) external override(IStakingAssetHandler) onlyOwner {
    isUnhinged[_address] = true;
    emit UnhingedAdded(_address);
  }

  function removeUnhinged(address _address) external override(IStakingAssetHandler) onlyOwner {
    isUnhinged[_address] = false;
    emit UnhingedRemoved(_address);
  }

  function getRollup() external view override(IStakingAssetHandler) returns (address) {
    return address(REGISTRY.getCanonicalRollup());
  }

  function getQueueLength() external view override(IStakingAssetHandler) returns (uint256) {
    return entryQueue.length();
  }

  function _validatePassportProof(address _attester, ProofVerificationParams calldata _params)
    internal
  {
    // Must NOT be using dev mode - https://docs.zkpassport.id/getting-started/dev-mode
    // If active, nullifiers will end up being zero, but it is user provided input, so we are sanity checking it
    require(_params.devMode == false, InvalidProof());

    (bool verified, bytes32 nullifier) = zkPassportVerifier.verifyProof(_params);

    require(verified, InvalidProof());
    require(!nullifiers[nullifier], SybilDetected(nullifier));

    // TODO(md): re-enforce this flow, it may change underfoot
    // Note: below appears to be checked within verifyProof
    // require(zkPassportVerifier.verifyScopes(params.publicInputs, validScope, validSubscope), InvalidProof());

    // Set nullifier to consumed
    nullifiers[nullifier] = true;

    // Add validator into the entry queue
    entryQueue.enqueue(_attester);
    emit AddedToQueue(_attester);
  }

  function _triggerDeposit(IStaking rollup, uint256 depositAmount, address _attester) internal {
    // If the attester is currently exiting, we finalize the exit for them.
    if (rollup.getExit(_attester).exists) {
      rollup.finaliseWithdraw(_attester);
    }

    STAKING_ASSET.approve(address(rollup), depositAmount);
    try rollup.deposit(_attester, withdrawer, true) {
      emit ValidatorAdded(address(rollup), _attester, withdrawer);
    } catch {
      // Allow the deposit call to fail silently e.g. when the attester has already been added
    }
  }
}
