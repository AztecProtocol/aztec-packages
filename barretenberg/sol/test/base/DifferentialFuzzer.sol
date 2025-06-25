pragma solidity >=0.8.21;

import {Vm} from "forge-std/Vm.sol";
import {strings} from "stringutils/strings.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {TestBase} from "./TestBase.sol";

contract DifferentialFuzzer is TestBase {
    using strings for *;
    using Strings for uint256;

    enum Flavor {
        Invalid,
        Standard,
        Ultra,
        Honk,
        HonkZK
    }
    enum CircuitType {
        Invalid,
        Blake,
        Add2,
        Ecdsa,
        Recursive
    }

    constructor() {}

    /// @notice the fuzzing flavor
    Flavor public flavor;

    /// @notice the circuit type
    CircuitType public circuitType;

    /// @notice the proofs public inputs
    uint256[] public inputs;

    function with_flavor(Flavor _flavor) public returns (DifferentialFuzzer) {
        flavor = _flavor;
        return this;
    }

    function with_circuit_type(CircuitType _flavor) public returns (DifferentialFuzzer) {
        circuitType = _flavor;
        return this;
    }

    function with_inputs(uint256[] memory _inputs) public returns (DifferentialFuzzer) {
        inputs = _inputs;
        return this;
    }

    function get_flavor() internal view returns (string memory) {
        if (flavor == Flavor.Standard) {
            return "standard";
        } else if (flavor == Flavor.Ultra) {
            return "ultra";
        } else if (flavor == Flavor.Honk) {
            return "honk";
        } else if (flavor == Flavor.HonkZK) {
            return "honk_zk";
        } else {
            revert("Invalid flavor");
        }
    }

    function get_circuit_type() internal view returns (string memory) {
        if (circuitType == CircuitType.Blake) {
            return "blake";
        } else if (circuitType == CircuitType.Add2) {
            return "add2";
        } else if (circuitType == CircuitType.Recursive) {
            return "recursive";
        } else if (circuitType == CircuitType.Ecdsa) {
            return "ecdsa";
        } else {
            revert("Invalid circuit flavor");
        }
    }

    // Encode inputs as a comma separated string for the ffi call
    function get_inputs() internal view returns (string memory input_params) {
        input_params = "";
        if (inputs.length > 0) {
            input_params = inputs[0].toHexString();
            for (uint256 i = 1; i < inputs.length; i++) {
                input_params = string.concat(input_params, ",", inputs[i].toHexString());
            }
        }
    }

    function generate_proof() public returns (bytes memory proof) {
        // Execute the c++ prover binary
        string[] memory ffi_cmds = new string[](4);
        ffi_cmds[0] = "./scripts/run_fuzzer.sh";
        ffi_cmds[1] = get_flavor();
        ffi_cmds[2] = get_circuit_type();
        ffi_cmds[3] = get_inputs();

        proof = vm.ffi(ffi_cmds);
    }
}
