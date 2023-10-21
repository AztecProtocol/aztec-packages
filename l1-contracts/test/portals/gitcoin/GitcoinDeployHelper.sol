pragma solidity ^0.8.18;

import {IStrategy} from "@allo/contracts/core/interfaces/IStrategy.sol";

import {DonationVotingStrategy} from
  "@allo/contracts/strategies/_poc/donation-voting/DonationVotingStrategy.sol";
import {Allo} from "@allo/contracts/core/Allo.sol";
import {Registry} from "@allo/contracts/core/Registry.sol";

import {Metadata} from "@allo/contracts/core/libraries/Metadata.sol";
import {Native} from "@allo/contracts/core/libraries/Native.sol";
import {PortalERC20} from "../PortalERC20.sol";

contract GitcoinDeployHelper {
  uint256 public poolId;
  address[] managers;
  address[] allowedTokens;

  PortalERC20 public token;
  Registry public registry;
  Allo public allo;

  DonationVotingStrategy public strategy;

  function info() public view returns (address, address, address, uint256) {
    return (address(token), address(strategy), address(allo), poolId);
  }

  // Deploys contracts and sets up the pool with a single recipient
  constructor(address _manager) {
    {
      token = new PortalERC20();
      registry = new Registry();
      registry.initialize(_manager);

      allo = new Allo();
      allo.initialize(address(registry), payable(_manager), 1e16, 0);

      strategy = new DonationVotingStrategy(address(allo), "DonationVotingStrategy");

      token.mint(address(strategy), 100e18);
    }

    {
      managers.push(msg.sender);
      if (msg.sender != _manager) {
        managers.push(_manager);
      }
      managers.push(address(this));
      allowedTokens.push(address(0));
    }

    Metadata memory poolMetadata = Metadata({protocol: 1, pointer: "PoolMetadata"});
    bytes32 profileId = registry.createProfile(0, "Aztec", poolMetadata, _manager, managers);

    uint64 start = uint64(block.timestamp);
    uint256 registrationStartTime = start;
    uint64 registrationEndTime = start + 12000;
    uint64 allocationStartTime = start;
    uint64 allocationEndTime = start + 60000;
    poolId = allo.createPoolWithCustomStrategy(
      profileId,
      address(strategy),
      abi.encode(
        false,
        true,
        registrationStartTime,
        registrationEndTime,
        allocationStartTime,
        allocationEndTime,
        allowedTokens
      ),
      address(token),
      0,
      poolMetadata,
      managers
    );

    {
      bytes memory data = abi.encode(_manager, false, Metadata({protocol: 1, pointer: "metadata"}));
      address recipientId = allo.registerRecipient(poolId, data);
      address[] memory recipientIds = new address[](1);
      recipientIds[0] = recipientId;
      IStrategy.Status[] memory recipientStatuses = new IStrategy.Status[](1);
      recipientStatuses[0] = IStrategy.Status.Accepted;
      strategy.reviewRecipients(recipientIds, recipientStatuses);
    }
  }
}
