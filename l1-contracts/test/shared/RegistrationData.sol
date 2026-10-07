// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Vm} from "forge-std/Vm.sol";

/**
 * A real BLS registration from `script/registration_data.json`. The fields are in the alphabetical order of the
 * JSON keys, which is the order `vm.parseJson` decodes an object in.
 */
struct RegistrationData {
  address attester;
  G1Point proofOfPossession;
  G1Point publicKeyInG1;
  G2Point publicKeyInG2;
}

library RegistrationDataLib {
  /// The first `_count` registrations in `script/registration_data.json`, read through the caller's `vm`.
  function load(Vm _vm, uint256 _count) internal view returns (RegistrationData[] memory regs) {
    bytes memory json = _vm.parseJson(_vm.readFile(string.concat(_vm.projectRoot(), "/script/registration_data.json")));
    RegistrationData[] memory all = abi.decode(json, (RegistrationData[]));
    require(_count <= all.length, "not enough registrations in script/registration_data.json");
    regs = new RegistrationData[](_count);
    for (uint256 i = 0; i < _count; i++) {
      regs[i] = all[i];
    }
  }
}
