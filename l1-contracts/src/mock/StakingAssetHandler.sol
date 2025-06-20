// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {MerkleProof} from "@oz/utils/cryptography/MerkleProof.sol";
import {ZKPassportVerifier, ProofVerificationParams} from "@zkpassport/ZKPassportVerifier.sol";

/**
 * @title StakingAssetHandler
 * @notice This contract is used as a faucet for creating validators.
 *
 * It allows anyone to join the queue to be a validator to the rollup.
 * Validators get added to the rollups deposit Queue up to `depositsPerMint` validators per day.
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
  event ValidatorAdded(address indexed _rollup, address indexed _attester, address _withdrawer);
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
  error AttesterDoesNotExist(address _attester);
  error NoNullifier();
  error MerkleProofInvalid();

  // Add validator methods
  function addValidator(
    address _attester,
    bytes32[] memory merkleProof,
    ProofVerificationParams memory _params
  ) external;
  function reenterExitedValidator(address _attester) external;

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
  function getRollup() external view returns (address);
}

contract StakingAssetHandler is IStakingAssetHandler, Ownable {
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

  mapping(address attester => bool isUnhinged) public isUnhinged;
  mapping(bytes32 nullifier => bool exists) public nullifiers;
  mapping(address attester => bytes32 nullifier) public attesterToNullifier;

  uint256 public lastMintTimestamp;
  uint256 public mintInterval;
  uint256 public depositsPerMint;
  bytes32 public depositMerkleRoot;

  address public withdrawer;

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
  }

  /**
   * Add a validator attester
   *
   * @param _attester - the validator's attester address
   */
  function addValidator(
    address _attester,
    bytes32[] memory _merkleProof,
    ProofVerificationParams calldata _params
  ) external override(IStakingAssetHandler) {
    IStaking rollup = IStaking(address(REGISTRY.getCanonicalRollup()));
    uint256 depositAmount = rollup.getDepositAmount();

    // If the sender is unhinged, will mint the required amount (to not impact other users).
    // Otherwise we add them to the deposit queue.
    if (isUnhinged[msg.sender]) {
      STAKING_ASSET.mint(address(this), depositAmount);

      _triggerDeposit(rollup, depositAmount, _attester);
    } else {
      _topUpIfRequired(depositAmount);

      _validateMerkleProof(_attester, _merkleProof);
      _validatePassportProof(_attester, _params);

      // If the attester is currently exiting, we finalize the exit for him.
      _triggerDeposit(rollup, depositAmount, _attester);
    }
  }

  /**
   * Re add a validator that has already supplied a passport proof.
   * Used to re-enter a validator that has been exited during testnet.
   *
   * @param _attester - the validator's attester address
   */
  function reenterExitedValidator(address _attester) external override(IStakingAssetHandler) {
    // Check that the validator has an associated nullifier
    bytes32 nullifier = attesterToNullifier[_attester];
    require(nullifier != bytes32(0), AttesterDoesNotExist(_attester));
    require(nullifiers[nullifier] != false, NoNullifier());

    IStaking rollup = IStaking(address(REGISTRY.getCanonicalRollup()));
    uint256 depositAmount = rollup.getDepositAmount();

    _topUpIfRequired(depositAmount);
    _triggerDeposit(rollup, depositAmount, _attester);
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

  /**
   * Validate an attester's zk passport proof
   *
   * @param _attester - The validator's attester address
   * @param _params - ZKPassport proof params
   */
  function _validatePassportProof(address _attester, ProofVerificationParams calldata _params)
    internal
  {
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
  }

  function _topUpIfRequired(uint256 _depositAmount) internal {
    if (STAKING_ASSET.balanceOf(address(this)) < _depositAmount) {
      require(
        block.timestamp - lastMintTimestamp >= mintInterval,
        ValidatorQuotaFilledUntil(lastMintTimestamp + mintInterval)
      );
      STAKING_ASSET.mint(address(this), _depositAmount * depositsPerMint);
      lastMintTimestamp = block.timestamp;
      emit ToppedUp(_depositAmount * depositsPerMint);
    }
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
  function _triggerDeposit(IStaking _rollup, uint256 _depositAmount, address _attester) internal {
    // If the attester is currently exiting, we finalize the exit for them.
    if (_rollup.getExit(_attester).exists) {
      _rollup.finaliseWithdraw(_attester);
    }

    STAKING_ASSET.approve(address(_rollup), _depositAmount);
    _rollup.deposit(_attester, withdrawer, true);
    emit ValidatorAdded(address(_rollup), _attester, withdrawer);
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
      bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(_attester))));
      require(MerkleProof.verify(_merkleProof, depositMerkleRoot, leaf), MerkleProofInvalid());
    }
  }
}
