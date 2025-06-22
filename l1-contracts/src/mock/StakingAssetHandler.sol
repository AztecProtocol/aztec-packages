// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

// solhint-disable quotes

import {IStaking, Status} from "@aztec/core/interfaces/IStaking.sol";
import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {MerkleProof} from "@oz/utils/cryptography/MerkleProof.sol";
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
  event AddedToQueue(address indexed _attester, address _proposer, uint256 _position);
  event ValidatorAdded(
    address indexed _rollup, address indexed _attester, address _proposer, address _withdrawer
  );
  event IntervalUpdated(uint256 _interval);
  event DepositsPerMintUpdated(uint256 _depositsPerMint);
  event WithdrawerUpdated(address indexed _withdrawer);
  event ZKPassportVerifierUpdated(address indexed _verifier);
  event ScopeUpdated(string newScope);
  event SubScopeUpdated(string newSubScope);
  event SkipBindCheckUpdated(bool _skipBindCheck);
  event SkipMerkleCheckUpdated(bool _skipMerkleCheck);
  event DepositMerkleRootUpdated(bytes32 _root);

  event UnhingedAdded(address indexed _address);
  event UnhingedRemoved(address indexed _address);

  error CannotMintZeroAmount();
  error ValidatorQuotaFilledUntil(uint256 _timestamp);
  error InvalidProof();
  error InvalidScope();
  error ProofNotBoundToAddress(address _expected, address _received);
  error SybilDetected(bytes32 _nullifier);
  error InDepositQueue();
  error AttesterDoesNotExist(address _attester);
  error NoNullifier();

  // TODO: think about this - we originally wanted it to be a different address, now it has to be the same???????
  // - the frontend will have to change because of this - or we will have to require a signature - but this could be front run????
  error AttesterNotSender();
  error MerkleProofInvalid();

  function addValidatorToQueue(
    address _attester,
    address _proposer,
    bytes32[] memory _merkleProof,
    ProofVerificationParams memory _params
  ) external;
  function reenterExitedValidator(address _attester, address _proposer) external;
  function dripQueue() external;

  // Admin methods
  function setMintInterval(uint256 _interval) external;
  function setDepositsPerMint(uint256 _depositsPerMint) external;
  function setWithdrawer(address _withdrawer) external;
  function addUnhinged(address _address) external;
  function removeUnhinged(address _address) external;
  function setZKPassportVerifier(address _address) external;
  function setScope(string memory _scope) external;
  function setSubscope(string memory _subscope) external;
  function setSkipBindCheck(bool _skipBindCheck) external;
  function setSkipMerkleCheck(bool _skipMerkleCheck) external;
  function setDepositMerkleRoot(bytes32 _root) external;

  // View
  function getQueueLength() external view returns (uint256);
  function getFrontOfQueue() external view returns (uint256);
  function getEndOfQueue() external view returns (uint256);
  function getRollup() external view returns (address);
}

contract StakingAssetHandler is IStakingAssetHandler, Ownable {
  using QueueLib for Queue;

  struct StakingAssetHandlerArgs {
    address owner;
    address stakingAsset;
    IRegistry registry;
    address withdrawer;
    uint256 mintInterval;
    uint256 depositsPerMint;
    bytes32 depositMerkleRoot;
    ZKPassportVerifier zkPassportVerifier;
    address[] unhinged;
    string scope;
    string subscope;
    bool skipBindCheck;
    bool skipMerkleCheck;
  }

  IMintableERC20 public immutable STAKING_ASSET;
  IRegistry public immutable REGISTRY;

  ZKPassportVerifier public zkPassportVerifier;

  bool internal skipBindCheck;
  bool internal skipMerkleCheck;

  mapping(address => bool) public isUnhinged;
  mapping(bytes32 nullifier => bool exists) public nullifiers;
  mapping(address attester => bytes32 nullifier) public attesterToNullifier;

  uint256 public lastMintTimestamp;
  uint256 public mintInterval;
  uint256 public depositsPerMint;
  bytes32 public depositMerkleRoot;

  address public withdrawer;

  Queue private entryQueue;

  string public validScope;
  string public validSubscope;

  constructor(StakingAssetHandlerArgs memory _args) Ownable(_args.owner) {
    require(_args.depositsPerMint > 0, CannotMintZeroAmount());

    STAKING_ASSET = IMintableERC20(_args.stakingAsset);
    REGISTRY = _args.registry;

    withdrawer = _args.withdrawer;
    emit WithdrawerUpdated(_args.withdrawer);

    mintInterval = _args.mintInterval;
    emit IntervalUpdated(_args.mintInterval);

    depositsPerMint = _args.depositsPerMint;
    emit DepositsPerMintUpdated(_args.depositsPerMint);

    for (uint256 i = 0; i < _args.unhinged.length; i++) {
      isUnhinged[_args.unhinged[i]] = true;
      emit UnhingedAdded(_args.unhinged[i]);
    }
    isUnhinged[_args.owner] = true;
    emit UnhingedAdded(_args.owner);

    zkPassportVerifier = _args.zkPassportVerifier;
    emit ZKPassportVerifierUpdated(address(_args.zkPassportVerifier));

    depositMerkleRoot = _args.depositMerkleRoot;
    emit DepositMerkleRootUpdated(_args.depositMerkleRoot);

    validScope = _args.scope;
    validSubscope = _args.subscope;

    skipBindCheck = _args.skipBindCheck;
    skipMerkleCheck = _args.skipMerkleCheck;

    entryQueue.init();
  }

  /**
   * Add a validator attester proposer pair into the deposit queue
   *
   * @param _attester - the validator's attester address
   */
  function addValidatorToQueue(
    address _attester,
    address _proposer,
    bytes32[] memory _merkleProof,
    ProofVerificationParams calldata _params
  ) external override(IStakingAssetHandler) {
    // If the sender is unhinged, will mint the required amount (to not impact other users).
    // Otherwise we add them to the deposit queue.
    if (isUnhinged[msg.sender]) {
      IStaking rollup = IStaking(address(REGISTRY.getCanonicalRollup()));
      uint256 depositAmount = rollup.getMinimumStake();

      STAKING_ASSET.mint(address(this), depositAmount);

      _triggerDeposit(rollup, depositAmount, _attester, _proposer);
    } else {
      _validateMerkleProof(_attester, _merkleProof);
      _validatePassportProof(_attester, _proposer, _params);
    }
  }

  /**
   * Re add a validator that has already supplied a passport proof.
   * Used to re-enter a validator that has been exited during testnet.
   *
   * @param _attester - the validator's attester address
   */
  function reenterExitedValidator(address _attester, address _proposer)
    external
    override(IStakingAssetHandler)
  {
    // Validator must not be in the queue
    require(!entryQueue.isInQueue(_attester), InDepositQueue());

    // Check that the validator has an associated nullifier
    bytes32 nullifier = attesterToNullifier[_attester];
    require(nullifier != bytes32(0), AttesterDoesNotExist(_attester));
    require(nullifiers[nullifier] != false, NoNullifier());

    _addToQueue(_attester, _proposer);
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
      (address attester, address proposer) = entryQueue.dequeue();
      _triggerDeposit(rollup, depositAmount, attester, proposer);
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

  function setSkipBindCheck(bool _skipBindCheck) external override(IStakingAssetHandler) onlyOwner {
    skipBindCheck = _skipBindCheck;
    emit SkipBindCheckUpdated(_skipBindCheck);
  }

  function setSkipMerkleCheck(bool _skipMerkleCheck)
    external
    override(IStakingAssetHandler)
    onlyOwner
  {
    skipMerkleCheck = _skipMerkleCheck;
    emit SkipMerkleCheckUpdated(_skipMerkleCheck);
  }

  function setDepositMerkleRoot(bytes32 _root) external override(IStakingAssetHandler) onlyOwner {
    depositMerkleRoot = _root;
    emit DepositMerkleRootUpdated(_root);
  }

  function getRollup() external view override(IStakingAssetHandler) returns (address) {
    return address(REGISTRY.getCanonicalRollup());
  }

  function getQueueLength() external view override(IStakingAssetHandler) returns (uint256) {
    return entryQueue.length();
  }

  function getFrontOfQueue() external view override(IStakingAssetHandler) returns (uint256) {
    return entryQueue.getFirst();
  }

  function getEndOfQueue() external view override(IStakingAssetHandler) returns (uint256) {
    return entryQueue.getLast();
  }

  /**
   * Validate an attester's zk passport proof
   *
   * @param _attester - The validator's attester address
   * @param _params - ZKPassport proof params
   */
  function _validatePassportProof(
    address _attester,
    address _proposer,
    ProofVerificationParams calldata _params
  ) internal {
    // Must NOT be using dev mode - https://docs.zkpassport.id/getting-started/dev-mode
    // If active, nullifiers will end up being zero, but it is user provided input, so we are sanity checking it
    require(_params.devMode == false, InvalidProof());

    (bool verified, bytes32 nullifier) = zkPassportVerifier.verifyProof(_params);

    require(verified, InvalidProof());
    require(!nullifiers[nullifier], SybilDetected(nullifier));

    // Note: below is checked from user input with proof in verify proof, however, we check here again to enforce scoping
    require(
      zkPassportVerifier.verifyScopes(_params.publicInputs, validScope, validSubscope),
      InvalidScope()
    );

    if (!skipBindCheck) {
      bytes memory data =
        zkPassportVerifier.getBindProofInputs(_params.committedInputs, _params.committedInputCounts);
      // Use the getBoundData function to get the formatted data
      // which includes the user's address and any custom data
      (address boundAddress,) = zkPassportVerifier.getBoundData(data);
      // Make sure the bound user address is the same as the _attester
      require(boundAddress == _attester, ProofNotBoundToAddress(boundAddress, _attester));
    }

    // Set nullifier to consumed
    nullifiers[nullifier] = true;
    attesterToNullifier[_attester] = nullifier;

    _addToQueue(_attester, _proposer);
  }

  /**
   * Add To Queue Entry Queue
   *
   * @param _attester - the validator attester address to add to the queue
   */
  function _addToQueue(address _attester, address _proposer) internal {
    // Add validator into the entry queue
    uint256 queueLocation = entryQueue.enqueue(_attester, _proposer);
    emit AddedToQueue(_attester, _proposer, queueLocation);
  }

  /**
   * Trigger Deposit
   * Deposit a validator into the rollup, if they are waiting on an exit, then
   * complete the exit for them first.
   *
   * @param _rollup - the rollup address
   * @param _depositAmount - the deposit amount
   * @param _attester - the validator's attester address
   */
  function _triggerDeposit(
    IStaking _rollup,
    uint256 _depositAmount,
    address _attester,
    address _proposer
  ) internal {
    IStaking rollup = IStaking(address(REGISTRY.getCanonicalRollup()));
    uint256 depositAmount = rollup.getMinimumStake();

    // If the attester is currently exiting, we finalize the exit for them.
    if (_rollup.getInfo(_attester).status == Status.EXITING) {
      _rollup.finaliseWithdraw(_attester);
    }

    STAKING_ASSET.approve(address(_rollup), _depositAmount);
    try _rollup.deposit(_attester, _proposer, withdrawer, depositAmount) {
      emit ValidatorAdded(address(_rollup), _attester, _proposer, withdrawer);
    } catch {
      // Allow the deposit call to fail silently e.g. when the attester has already been added
    }
  }

  /**
   * Validate Merkle Proof
   *
   * Check the provided merkle proof is correct for the given address
   *
   * @param _attester - the attester
   * @param _merkleProof - a merkle proof for the attester
   */
  function _validateMerkleProof(address _attester, bytes32[] memory _merkleProof) internal view {
    if (!skipMerkleCheck) {
      require(msg.sender == _attester, AttesterNotSender());

      bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(_attester))));
      require(MerkleProof.verify(_merkleProof, depositMerkleRoot, leaf), MerkleProofInvalid());
    }
  }
}
