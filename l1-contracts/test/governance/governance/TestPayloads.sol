// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";

contract EmptyPayload is IPayload {
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {}
}

contract CallAssetPayload is IPayload {
  IMintableERC20 internal immutable ASSET;
  address internal immutable OWNER;
  address internal immutable GOVERNANCE;

  constructor(IMintableERC20 _asset, address _governance) {
    ASSET = _asset;
    OWNER = msg.sender;
    GOVERNANCE = _governance;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);
    uint256 balance = ASSET.balanceOf(GOVERNANCE);

    res[0] = Action({
      target: address(ASSET),
      data: abi.encodeWithSelector(ASSET.transfer.selector, OWNER, balance)
    });

    return res;
  }
}

contract FakeRollup {
  function getVersion() external view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(bytes("aztec_rollup"), block.chainid, address(this))));
  }
}

contract UpgradePayload is IPayload {
  IRegistry public immutable REGISTRY;
  address public NEW_ROLLUP = address(new FakeRollup());

  constructor(IRegistry _registry) {
    REGISTRY = _registry;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);

    res[0] = Action({
      target: address(REGISTRY),
      data: abi.encodeWithSelector(REGISTRY.addRollup.selector, NEW_ROLLUP)
    });

    return res;
  }
}

contract CallRevertingPayload is IPayload {
  RevertingCall public immutable TARGET = new RevertingCall();

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);

    res[0] = Action({
      target: address(TARGET),
      data: abi.encodeWithSelector(TARGET.skibBobFlipFlop.selector)
    });

    return res;
  }
}

contract RevertingCall {
  error TrapCardActivated();

  function skibBobFlipFlop() external pure {
    revert TrapCardActivated();
  }
}
