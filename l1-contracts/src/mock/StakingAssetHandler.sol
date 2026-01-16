// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {ProofVerificationParams, BoundData} from "@zkpassport/Types.sol";
import {ZKPassportHelper} from "@zkpassport/ZKPassportHelper.sol";
import {ZKPassportRootVerifier as ZKPassportVerifier} from "@zkpassport/ZKPassportRootVerifier.sol";

/**
 * @title StakingAssetHandler
 * @notice This contract is a simple STK token faucet with ZKPassport sybil resistance.
 *
 * Users call `claim()` to receive a configurable amount of STK tokens.
 * Each ZKPassport can only be used once (unless the owner resets the nullifier).
 * Users then deposit into the rollup themselves.
 *
 * @dev This contract must be funded with STK tokens (either by minting or transfer).
 *
 * @dev Only the owner can grant and revoke the `isUnhinged` role, and perform other administrative tasks
 *      such as setting the faucet amount, ZKPassport settings, and resetting nullifiers.
 */
interface IStakingAssetHandler {
  event Claimed(address indexed recipient, uint256 amount, bytes32 nullifier);
  event FaucetAmountUpdated(uint256 newAmount);
  event NullifierReset(bytes32 nullifier);
  event ZKPassportVerifierUpdated(address indexed _verifier);
  event DomainUpdated(string newDomain);
  event ScopeUpdated(string newScope);
  event SkipBindCheckUpdated(bool _skipBindCheck);

  event UnhingedAdded(address indexed _address);
  event UnhingedRemoved(address indexed _address);

  error InvalidProof();
  error InvalidScope();
  error InvalidDomain();
  error InvalidBoundAddress(address _expected, address _received);
  error InvalidChainId(uint256 _expected, uint256 _received);
  error InvalidAge();
  error InvalidCountry();
  error InvalidValidityPeriod();
  error InvalidFaceMatch();
  error ExtraDiscloseDataNonZero();
  error SybilDetected(bytes32 _nullifier);
  error InsufficientBalance();

  // Claim tokens
  function claim(ProofVerificationParams calldata _params) external;

  // Admin methods
  function setFaucetAmount(uint256 _amount) external;
  function resetNullifier(bytes32 _nullifier) external;
  function addUnhinged(address _address) external;
  function removeUnhinged(address _address) external;
  function setZKPassportVerifier(address _address) external;
  function setDomain(string memory _domain) external;
  function setScope(string memory _scope) external;
  function setSkipBindCheck(bool _skipBindCheck) external;

  // View
  function getRollup() external view returns (address);
}

contract StakingAssetHandler is IStakingAssetHandler, Ownable {
  struct StakingAssetHandlerArgs {
    address owner;
    address stakingAsset;
    IRegistry registry;
    uint256 faucetAmount;
    ZKPassportVerifier zkPassportVerifier;
    address[] unhinged;
    string domain;
    string scope;
    bool skipBindCheck;
  }

  // Excluded countries list
  string internal constant PKR = "PRK";
  string internal constant UKR = "UKR";
  string internal constant IRN = "IRN";
  string internal constant CUB = "CUB";

  // Minimum age
  uint8 public constant MIN_AGE = 18;

  // Validity period in seconds
  uint256 public constant VALIDITY_PERIOD = 7 days;

  // Default faucet amount: 1M STK
  uint256 public constant DEFAULT_FAUCET_AMOUNT = 1_000_000 * 1e18;

  IMintableERC20 public immutable STAKING_ASSET;
  IRegistry public immutable REGISTRY;

  ZKPassportVerifier public zkPassportVerifier;

  bool internal skipBindCheck;

  mapping(address user => bool isUnhinged) public isUnhinged;
  mapping(bytes32 nullifier => bool exists) public nullifiers;
  mapping(address user => bytes32 nullifier) public addressToNullifier;

  uint256 public faucetAmount;

  // ZKPassport constraints
  string public validDomain;
  string public validScope;

  constructor(StakingAssetHandlerArgs memory _args) Ownable(_args.owner) {
    STAKING_ASSET = IMintableERC20(_args.stakingAsset);
    REGISTRY = _args.registry;

    faucetAmount = _args.faucetAmount > 0 ? _args.faucetAmount : DEFAULT_FAUCET_AMOUNT;
    emit FaucetAmountUpdated(faucetAmount);

    for (uint256 i = 0; i < _args.unhinged.length; i++) {
      isUnhinged[_args.unhinged[i]] = true;
      emit UnhingedAdded(_args.unhinged[i]);
    }
    isUnhinged[_args.owner] = true;
    emit UnhingedAdded(_args.owner);

    zkPassportVerifier = _args.zkPassportVerifier;
    emit ZKPassportVerifierUpdated(address(_args.zkPassportVerifier));

    validDomain = _args.domain;
    validScope = _args.scope;

    skipBindCheck = _args.skipBindCheck;
  }

  /**
   * Claim STK tokens from the faucet
   *
   * @param _params - ZKPassport proof params (ignored for unhinged users)
   */
  function claim(ProofVerificationParams calldata _params) external override(IStakingAssetHandler) {
    // Check we have enough balance
    require(STAKING_ASSET.balanceOf(address(this)) >= faucetAmount, InsufficientBalance());

    if (isUnhinged[msg.sender]) {
      // Unhinged users skip proof verification
      STAKING_ASSET.transfer(msg.sender, faucetAmount);
      emit Claimed(msg.sender, faucetAmount, bytes32(0));
      return;
    }

    // Validate passport proof for sybil resistance
    bytes32 nullifier = _validatePassportProof(msg.sender, _params);

    // Transfer tokens to caller
    STAKING_ASSET.transfer(msg.sender, faucetAmount);
    emit Claimed(msg.sender, faucetAmount, nullifier);
  }

  function setFaucetAmount(uint256 _amount) external override(IStakingAssetHandler) onlyOwner {
    faucetAmount = _amount;
    emit FaucetAmountUpdated(_amount);
  }

  function resetNullifier(bytes32 _nullifier) external override(IStakingAssetHandler) onlyOwner {
    nullifiers[_nullifier] = false;
    emit NullifierReset(_nullifier);
  }

  function setZKPassportVerifier(address _zkPassportVerifier) external override(IStakingAssetHandler) onlyOwner {
    zkPassportVerifier = ZKPassportVerifier(_zkPassportVerifier);
    emit ZKPassportVerifierUpdated(_zkPassportVerifier);
  }

  function setDomain(string memory _domain) external override(IStakingAssetHandler) onlyOwner {
    validDomain = _domain;
    emit DomainUpdated(_domain);
  }

  function setScope(string memory _scope) external override(IStakingAssetHandler) onlyOwner {
    validScope = _scope;
    emit ScopeUpdated(_scope);
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

  function getRollup() external view override(IStakingAssetHandler) returns (address) {
    return address(REGISTRY.getCanonicalRollup());
  }

  /**
   * Validate a user's zk passport proof
   *
   * @param _user - The user's address
   * @param _params - ZKPassport proof params
   * @return nullifier - The nullifier from the proof
   */
  function _validatePassportProof(address _user, ProofVerificationParams calldata _params)
    internal
    returns (bytes32 nullifier)
  {
    // Must NOT be using dev mode - https://docs.zkpassport.id/getting-started/dev-mode
    // If active, nullifiers will end up being zero, but it is user provided input, so we are sanity checking it
    require(_params.serviceConfig.devMode == false, InvalidProof());

    require(keccak256(bytes(_params.serviceConfig.domain)) == keccak256(bytes(validDomain)), InvalidDomain());
    require(keccak256(bytes(_params.serviceConfig.scope)) == keccak256(bytes(validScope)), InvalidScope());
    require(_params.serviceConfig.validityPeriodInSeconds == VALIDITY_PERIOD, InvalidValidityPeriod());

    bool verified;
    ZKPassportHelper helper;
    (verified, nullifier, helper) = zkPassportVerifier.verify(_params);

    require(verified, InvalidProof());
    require(!nullifiers[nullifier], SybilDetected(nullifier));

    if (!skipBindCheck) {
      BoundData memory boundData = helper.getBoundData(_params.committedInputs);

      // Make sure the bound user address is the same as the _user
      require(boundData.senderAddress == _user, InvalidBoundAddress(boundData.senderAddress, _user));
      // Make sure the chainId is the same as the current chainId
      require(boundData.chainId == block.chainid, InvalidChainId(boundData.chainId, block.chainid));
      // Make sure the custom data is empty
      require(bytes(boundData.customData).length == 0, ExtraDiscloseDataNonZero());

      // Country exclusion check
      string[] memory excludedCountries = new string[](4);
      excludedCountries[0] = CUB;
      excludedCountries[1] = IRN;
      excludedCountries[2] = PKR;
      excludedCountries[3] = UKR;
      bool isCountryValid = helper.isNationalityOut(excludedCountries, _params.committedInputs);
      require(isCountryValid, InvalidCountry());
    }

    // Set nullifier to consumed
    nullifiers[nullifier] = true;
    addressToNullifier[_user] = nullifier;
  }
}
