// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

contract FeeJuicePortal is IFeeJuicePortal {
  using SafeERC20 for IERC20;

  IRegistry public immutable REGISTRY;
  IERC20 public immutable UNDERLYING;
  bytes32 public immutable L2_TOKEN_ADDRESS;

  bool public initialized;

  constructor(address _registry, address _underlying, bytes32 _l2TokenAddress) {
    require(
      _registry != address(0) && _underlying != address(0) && _l2TokenAddress != 0,
      Errors.FeeJuicePortal__InvalidInitialization()
    );

    REGISTRY = IRegistry(_registry);
    UNDERLYING = IERC20(_underlying);
    L2_TOKEN_ADDRESS = _l2TokenAddress;
  }

  /**
   * @notice  Initialize the FeeJuicePortal
   *
   * @dev     This function is only callable by the owner of the contract and only once
   *
   * @dev     Must be funded with FEE_JUICE_INITIAL_MINT tokens before initialization to
   *          ensure that the L2 contract is funded and able to pay for its deployment.
   */
  function initialize() external override(IFeeJuicePortal) {
    require(!initialized, Errors.FeeJuicePortal__AlreadyInitialized());

    uint256 balance = UNDERLYING.balanceOf(address(this));
    if (balance < Constants.FEE_JUICE_INITIAL_MINT) {
      UNDERLYING.safeTransferFrom(
        msg.sender, address(this), Constants.FEE_JUICE_INITIAL_MINT - balance
      );
    }
    initialized = true;
  }

  /**
   * @notice Deposit funds into the portal and adds an L2 message which can only be consumed publicly on Aztec
   * @param _to - The aztec address of the recipient
   * @param _amount - The amount to deposit
   * @param _secretHash - The hash of the secret consumable message. The hash should be 254 bits (so it can fit in a Field element)
   * @return - The key of the entry in the Inbox and its leaf index
   */
  function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
    external
    override(IFeeJuicePortal)
    returns (bytes32, uint256)
  {
    // Preamble
    address rollup = canonicalRollup();
    uint256 version = REGISTRY.getVersionFor(rollup);
    IInbox inbox = IRollup(rollup).INBOX();
    DataStructures.L2Actor memory actor = DataStructures.L2Actor(L2_TOKEN_ADDRESS, version);

    // Hash the message content to be reconstructed in the receiving contract
    bytes32 contentHash =
      Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", _to, _amount));

    // Hold the tokens in the portal
    UNDERLYING.safeTransferFrom(msg.sender, address(this), _amount);

    // Send message to rollup
    (bytes32 key, uint256 index) = inbox.sendL2Message(actor, contentHash, _secretHash);

    emit DepositToAztecPublic(_to, _amount, _secretHash, key, index);

    return (key, index);
  }

  /**
   * @notice  Let the rollup distribute fees to an account
   *
   *          Since the assets cannot be exited the usual way, but only paid as fees to sequencers
   *          we include this function to allow the rollup to do just that, bypassing the usual
   *          flows.
   *
   * @param _to - The address to receive the payment
   * @param _amount - The amount to pay them
   */
  function distributeFees(address _to, uint256 _amount) external override(IFeeJuicePortal) {
    require(msg.sender == canonicalRollup(), Errors.FeeJuicePortal__Unauthorized());
    UNDERLYING.safeTransfer(_to, _amount);

    emit FeesDistributed(_to, _amount);
  }

  function canonicalRollup() public view override(IFeeJuicePortal) returns (address) {
    return REGISTRY.getRollup();
  }
}
