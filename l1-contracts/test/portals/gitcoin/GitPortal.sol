pragma solidity >=0.8.18;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {IRegistry} from "../../../src/core/interfaces/messagebridge/IRegistry.sol";
import {DataStructures} from "../../../src/core/libraries/DataStructures.sol";
import {Hash} from "../../../src/core/libraries/Hash.sol";

import {TokenPortal} from "../TokenPortal.sol";

import {Allo} from "@allo/contracts/core/Allo.sol";
import {DonationVotingStrategy} from
  "@allo/contracts/strategies/_poc/donation-voting/DonationVotingStrategy.sol";

contract GitPortal {
  TokenPortal public tokenPortal;
  IRegistry public registry;
  Allo public allo;

  bytes32 public l2Address;

  constructor() {}

  function initialize(address _tokenPortal, address _registry, address _allo, bytes32 _l2Address)
    public
  {
    tokenPortal = TokenPortal(_tokenPortal);
    registry = IRegistry(_registry);
    allo = Allo(_allo);

    l2Address = _l2Address;
  }

  // We just get assets out. Nothing into the rollup! Forget refunds, get rekt noob.

  function donate(uint256 _poolId, address _whom, uint256 _amount, bool _withCaller) public {
    // Withdraw from the bridge.
    tokenPortal.withdraw(address(this), _amount, true);

    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(l2Address, 1),
      recipient: DataStructures.L1Actor(address(this), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature(
          "donate(uint256,address,uint256)",
          _poolId,
          _whom,
          _amount,
          _withCaller ? msg.sender : address(0)
        )
        )
    });

    registry.getOutbox().consume(message);

    // Need to approve the strategy, but since gitcoin don't actually use it
    // (vulnerability in their unpublished code), we skip it here 🤷

    address underlyingToken = address(tokenPortal.underlying());
    allo.allocate(_poolId, abi.encode(_whom, _amount, underlyingToken));
  }

  function getClaim(address _strategy, address _token, address _whom) public view returns (uint256) {
    return DonationVotingStrategy(payable(_strategy)).claims(_whom, _token);
  }
}
