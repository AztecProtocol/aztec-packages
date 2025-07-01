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
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

contract FeeJuicePortal is IFeeJuicePortal {
  using SafeERC20 for IERC20;

  bytes32 public constant L2_TOKEN_ADDRESS = bytes32(Constants.FEE_JUICE_ADDRESS);

  IRollup public immutable ROLLUP;
  IInbox public immutable INBOX;
  IERC20 public immutable UNDERLYING;
  uint256 public immutable VERSION;

  constructor(IRollup _rollup, IERC20 _underlying, IInbox _inbox, uint256 _version) {
    ROLLUP = _rollup;
    INBOX = _inbox;
    UNDERLYING = _underlying;
    VERSION = _version;
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
    DataStructures.L2Actor memory actor = DataStructures.L2Actor(L2_TOKEN_ADDRESS, VERSION);

    // Hash the message content to be reconstructed in the receiving contract
    bytes32 contentHash =
      Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", _to, _amount));

    // Hold the tokens in the portal
    UNDERLYING.safeTransferFrom(msg.sender, address(this), _amount);

    // Send message to rollup
    (bytes32 key, uint256 index) = INBOX.sendL2Message(actor, contentHash, _secretHash);

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
    require(msg.sender == address(ROLLUP), Errors.FeeJuicePortal__Unauthorized());
    UNDERLYING.safeTransfer(_to, _amount);

    emit FeesDistributed(_to, _amount);
  }
}
