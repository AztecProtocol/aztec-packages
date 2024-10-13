// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

import {Ownable} from "@oz/access/Ownable.sol";

contract FeeJuicePortal is IFeeJuicePortal, Ownable {
  using SafeERC20 for IERC20;

  IRegistry public registry;
  IERC20 public underlying;
  bytes32 public l2TokenAddress;

  constructor(address _owner, address _registry, address _underlying, bytes32 _l2TokenAddress)
    Ownable(_owner)
  {
    require(
      _registry != address(0) && _underlying != address(0) && _l2TokenAddress != 0,
      Errors.FeeJuicePortal__InvalidInitialization()
    );

    registry = IRegistry(_registry);
    underlying = IERC20(_underlying);
    l2TokenAddress = _l2TokenAddress;
  }

  /**
   * @notice  Initialize the FeeJuicePortal
   *
   * @dev     This function is only callable by the owner of the contract and only once
   *
   * @dev     Must be funded with FEE_JUICE_INITIAL_MINT tokens before initialization to
   *          ensure that the L2 contract is funded and able to pay for its deployment.
   */
  function initialize() external override(IFeeJuicePortal) onlyOwner {
    require(owner() != address(0), Errors.FeeJuicePortal__AlreadyInitialized());

    uint256 balance = underlying.balanceOf(address(this));
    if (balance < Constants.FEE_JUICE_INITIAL_MINT) {
      underlying.safeTransferFrom(
        msg.sender, address(this), Constants.FEE_JUICE_INITIAL_MINT - balance
      );
    }
    _transferOwnership(address(0));
  }

  /**
   * @notice Deposit funds into the portal and adds an L2 message which can only be consumed publicly on Aztec
   * @param _to - The aztec address of the recipient
   * @param _amount - The amount to deposit
   * @param _secretHash - The hash of the secret consumable message. The hash should be 254 bits (so it can fit in a Field element)
   * @return - The key of the entry in the Inbox
   */
  function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
    external
    override(IFeeJuicePortal)
    returns (bytes32)
  {
    // Preamble
    IInbox inbox = IRollup(registry.getRollup()).INBOX();
    DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2TokenAddress, 1);

    // Hash the message content to be reconstructed in the receiving contract
    bytes32 contentHash =
      Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", _to, _amount));

    // Hold the tokens in the portal
    underlying.safeTransferFrom(msg.sender, address(this), _amount);

    // Send message to rollup
    return inbox.sendL2Message(actor, contentHash, _secretHash);
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
    require(msg.sender == registry.getRollup(), Errors.FeeJuicePortal__Unauthorized());
    underlying.safeTransfer(_to, _amount);
  }
}
