// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface
// solhint-disable no-complex-fallback
// solhint-disable payable-fallback

import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";
import {Clones} from "@oz/proxy/Clones.sol";
import {ERC1967Proxy} from "@oz/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @notice Minimal stand-in for an Aztec Token Position (ATP): the vesting contract that knows its registry.
 * @dev Also serves as the implementation of mainnet-shaped positions: those are EIP-1167 clones of it, and the
 *      registry is an immutable of the implementation, so a clone answers `getRegistry()` through a delegatecall.
 */
contract MockATP is IATP {
  address internal immutable REGISTRY;

  constructor(address _registry) {
    REGISTRY = _registry;
  }

  function getRegistry() external view override(IATP) returns (address) {
    return REGISTRY;
  }
}

/**
 * @notice Minimal stand-in for an ATP staker: the contract an ATP stakes through, which registers itself as the
 *         GSE withdrawer and exposes the ATP it belongs to.
 */
contract MockATPStaker is IATPStaker {
  address internal immutable ATP;

  constructor(address _atp) {
    ATP = _atp;
  }

  function getATP() external view override(IATPStaker) returns (address) {
    return ATP;
  }
}

/**
 * @notice Deploys a mock ATP for `_registry` and a mock staker pointing at it.
 */
function deployMockATPStaker(address _registry) returns (MockATPStaker staker, MockATP atp) {
  atp = new MockATP(_registry);
  staker = new MockATPStaker(address(atp));
}

/**
 * @notice ATP staker implementation shaped like the mainnet ones: stakers are ERC1967 proxies of it and keep their
 *         ATP in storage slot 0, so `getATP()` costs a delegatecall and two storage reads (implementation slot and
 *         ATP slot).
 */
contract MockATPStakerImplementation is IATPStaker {
  address internal atp;

  function initialize(address _atp) external {
    require(atp == address(0), "initialized");
    atp = _atp;
  }

  function getATP() external view override(IATPStaker) returns (address) {
    return atp;
  }
}

/**
 * @notice Deploys a mainnet-shaped position: an EIP-1167 clone of `_atpImplementation` and an ERC1967 proxy of
 *         `_stakerImplementation` pointing at it.
 */
function deployMainnetShapedATPStaker(MockATP _atpImplementation, address _stakerImplementation)
  returns (address staker, address atp)
{
  atp = Clones.clone(address(_atpImplementation));
  staker =
    address(new ERC1967Proxy(_stakerImplementation, abi.encodeCall(MockATPStakerImplementation.initialize, (atp))));
}

/**
 * @notice Reverts every getter, with 32 bytes of revert data, so that only the call status tells it apart from a
 *         well-formed answer.
 */
contract RevertingAddressGetter is IATP, IATPStaker {
  function getRegistry() external pure override(IATP) returns (address) {
    _revert();
  }

  function getATP() external pure override(IATPStaker) returns (address) {
    _revert();
  }

  function _revert() internal pure {
    assembly ("memory-safe") {
      mstore(0x00, 0x42)
      revert(0x00, 0x20)
    }
  }
}

/**
 * @notice Answers any call with `_returnDataSize` bytes. 31 and 33 are malformed; a large size is a return bomb, which
 *         succeeds if its memory expansion fits the probe stipend (64 KiB does) and runs out of gas otherwise.
 */
contract VariableReturnDataAddressGetter {
  uint256 private immutable RETURN_DATA_SIZE;

  constructor(uint256 _returnDataSize) {
    RETURN_DATA_SIZE = _returnDataSize;
  }

  fallback() external {
    uint256 size = RETURN_DATA_SIZE;

    assembly {
      mstore(0x00, 0x42)
      return(0x00, size)
    }
  }
}

/**
 * @notice Answers every getter with a word whose upper 96 bits are not clean.
 */
contract DirtyAddressGetter is IATP, IATPStaker {
  function getRegistry() external pure override(IATP) returns (address) {
    _returnDirty();
  }

  function getATP() external pure override(IATPStaker) returns (address) {
    _returnDirty();
  }

  function _returnDirty() internal pure {
    assembly ("memory-safe") {
      mstore(0x00, or(shl(160, 1), 0x42))
      return(0x00, 0x20)
    }
  }
}

/**
 * @notice Burns all the gas it is given.
 */
contract GasBurningAddressGetter {
  fallback() external {
    assembly {
      for {} 1 {} {}
    }
  }
}

/**
 * @notice Burns almost all the gas it is given, then answers any call with a well-formed `ANSWER`. The most expensive
 *         way to respond successfully to a probe.
 */
contract ExpensiveAddressGetter {
  address internal immutable ANSWER;

  constructor(address _answer) {
    ANSWER = _answer;
  }

  fallback() external {
    address answer = ANSWER;
    assembly {
      for {} gt(gas(), 300) {} {}
      mstore(0x00, answer)
      return(0x00, 0x20)
    }
  }
}

/**
 * @notice Answers any call with a configured response, returned or reverted with.
 */
contract RawReturnGetter {
  bytes internal response;
  bool internal immutable REVERTS;

  constructor(bytes memory _response, bool _reverts) {
    response = _response;
    REVERTS = _reverts;
  }

  fallback() external {
    bytes memory data = response;
    bool reverts = REVERTS;
    assembly {
      if reverts {
        revert(add(data, 0x20), mload(data))
      }
      return(add(data, 0x20), mload(data))
    }
  }
}
