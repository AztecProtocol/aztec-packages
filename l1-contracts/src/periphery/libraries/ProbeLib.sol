// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @title ProbeLib
 * @author Aztec Labs
 * @notice Gas-bounded, never-reverting view calls into contracts a validator may control, for sequencer reward
 *         calculators.
 *
 * @dev A calculator resolves a proposer through contracts that anyone can deploy: `Rollup.deposit` lets the depositor
 *      name any withdrawer. Each probe therefore:
 *      - treats an account without code (an EOA, a precompile, an undeployed address) as not responding, so that a
 *        precompile cannot answer for a contract (RIPEMD-160 returns a clean 32-byte word for any input);
 *      - forwards a fixed gas stipend, so a target that burns gas costs the caller at most that stipend plus the
 *        call overhead;
 *      - copies at most 32 bytes of return data and requires `returndatasize` to be exactly 32, so an oversized
 *        response costs the caller nothing and a short or long one is rejected;
 *      - requires the word to be a canonical encoding of the expected type (clean upper bits for an address, 0 or 1
 *        for a bool);
 *      - never reverts.
 *
 *      Under EIP-150 a probe receives `min(_gas, 63/64 of the gas left)`, so a caller that runs low on gas sees probes
 *      fail rather than revert. Calculators run with a fixed stipend, so this does not depend on the submitter.
 */
library ProbeLib {
  /**
   * @notice Probes `_target` with a zero-argument view call that is expected to return a single address.
   * @param _target The contract to probe
   * @param _selector The selector of the zero-argument getter
   * @param _gas The gas forwarded to the call
   * @return responded Whether the call succeeded and returned exactly one clean address word
   * @return result The returned address, or zero when the probe failed
   */
  function tryGetAddress(address _target, bytes4 _selector, uint256 _gas)
    internal
    view
    returns (bool responded, address result)
  {
    (bool ok, uint256 word) = _probe(_target, _selector, address(0), false, _gas);
    if (ok && word >> 160 == 0) {
      // forge-lint: disable-next-line(unsafe-typecast)
      return (true, address(uint160(word)));
    }
    return (false, address(0));
  }

  /**
   * @notice Probes `_target` with a one-address-argument view call that is expected to return a single bool.
   * @param _target The contract to probe
   * @param _selector The selector of the getter, taking one `address` argument
   * @param _arg The argument
   * @param _gas The gas forwarded to the call
   * @return responded Whether the call succeeded and returned exactly one word holding 0 or 1
   * @return result The returned bool, or false when the probe failed
   */
  function tryGetBool(address _target, bytes4 _selector, address _arg, uint256 _gas)
    internal
    view
    returns (bool responded, bool result)
  {
    (bool ok, uint256 word) = _probe(_target, _selector, _arg, true, _gas);
    if (ok && word <= 1) {
      return (true, word == 1);
    }
    return (false, false);
  }

  /**
   * @dev Calls `_target` with `_selector` and, if `_hasArg`, one address argument, using only the scratch space
   *      (0x00-0x3f) for calldata and return data.
   */
  function _probe(address _target, bytes4 _selector, address _arg, bool _hasArg, uint256 _gas)
    private
    view
    returns (bool ok, uint256 word)
  {
    if (_target.code.length == 0) {
      return (false, 0);
    }

    assembly ("memory-safe") {
      mstore(0x00, and(_selector, shl(224, 0xffffffff)))
      let size := 0x04
      if _hasArg {
        mstore(0x04, and(_arg, sub(shl(160, 1), 1)))
        size := 0x24
      }
      let success := staticcall(_gas, _target, 0x00, size, 0x00, 0x20)
      ok := and(success, eq(returndatasize(), 0x20))
      if ok {
        word := mload(0x00)
      }
    }
  }
}
