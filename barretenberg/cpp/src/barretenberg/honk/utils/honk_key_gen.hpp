// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

/**
 * Write a solidity file containing the vk params to the given stream.
 * Uses UltraHonk
 *
 * @param os
 * @param key - verification key object
 * @param class_name - the name to give the verification key class
 * @param include_types_import - include a "HonkTypes" import, only required for local tests, not with the bundled
 *contract from bb contract_honk
 **/
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include <ostream>
inline void output_vk_sol_ultra_honk(std::ostream& os,
                                     auto const& key,
                                     std::string const& class_name,
                                     bool include_types_import = false)
{

    const auto print_u256_const = [&](const auto& element, const std::string& name) {
        os << "uint256 constant " << name << " = " << element << ";" << std::endl;
    };

    const auto print_u256 = [&](const auto& element, const std::string& name) {
        os << "            " << name << ": uint256(" << element << ")," << std::endl;
    };

    const auto print_g1_proof_point = [&](const auto& element, const std::string& name, const bool last = false) {
        // split element.x into x_0 and x_1 and element.y into y_0 and y_1
        std::vector<bb::fr> xs = bb::field_conversion::convert_grumpkin_fr_to_bn254_frs(element.x);
        std::vector<bb::fr> ys = bb::field_conversion::convert_grumpkin_fr_to_bn254_frs(element.y);
        os << "            " << name << ": Honk.G1ProofPoint({ \n"
           << "               "
           << "x_0: "
           << "uint256(" << xs[0] << "),\n"
           << "               "
           << "x_1: "
           << "uint256(" << xs[1] << "),\n"
           << "               "
           << "y_0: "
           << "uint256(" << ys[0] << "),\n"
           << "               "
           << "y_1: "
           << "uint256(" << ys[1] << ")\n"
           << "            })";

        // only include comma if we are not the last element
        if (!last) {
            os << ",\n";
        } else {
            os << "\n";
        }
    };

    // Include the types import if working with the local test suite
    const auto print_types_import = [&]() {
        if (include_types_import) {
            os << "import { Honk } from \"../HonkTypes.sol\";\n";
        }
    };

    // clang-format off
    os <<
    //   "// Verification Key Hash: " << key->sha256_hash() << "\n"
      "// SPDX-License-Identifier: Apache-2.0\n"
      "// Copyright 2022 Aztec\n"
      "pragma solidity >=0.8.21;\n"
      "\n"
    "";
    print_types_import();
    print_u256_const(key->circuit_size, "N");
    print_u256_const(key->log_circuit_size, "LOG_N");
    print_u256_const(key->num_public_inputs, "NUMBER_OF_PUBLIC_INPUTS");
    os << ""
    "library " << class_name << " {\n"
      "    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {\n"
      "        Honk.VerificationKey memory vk = Honk.VerificationKey({\n";
    print_u256(key->circuit_size, "circuitSize");
    print_u256(key->log_circuit_size, "logCircuitSize");
    print_u256(key->num_public_inputs, "publicInputsSize");
    print_g1_proof_point(key->q_l, "ql");
    print_g1_proof_point(key->q_r, "qr");
    print_g1_proof_point(key->q_o, "qo");
    print_g1_proof_point(key->q_4, "q4");
    print_g1_proof_point(key->q_m, "qm");
    print_g1_proof_point(key->q_c, "qc");
    print_g1_proof_point(key->q_arith, "qArith");
    print_g1_proof_point(key->q_delta_range, "qDeltaRange");
    print_g1_proof_point(key->q_elliptic, "qElliptic");
    print_g1_proof_point(key->q_aux, "qAux");
    print_g1_proof_point(key->q_lookup, "qLookup");
    print_g1_proof_point(key->q_poseidon2_external, "qPoseidon2External");
    print_g1_proof_point(key->q_poseidon2_internal, "qPoseidon2Internal");
    print_g1_proof_point(key->sigma_1, "s1");
    print_g1_proof_point(key->sigma_2, "s2");
    print_g1_proof_point(key->sigma_3, "s3");
    print_g1_proof_point(key->sigma_4, "s4");
    print_g1_proof_point(key->table_1, "t1");
    print_g1_proof_point(key->table_2, "t2");
    print_g1_proof_point(key->table_3, "t3");
    print_g1_proof_point(key->table_4, "t4");
    print_g1_proof_point(key->id_1, "id1");
    print_g1_proof_point(key->id_2, "id2");
    print_g1_proof_point(key->id_3, "id3");
    print_g1_proof_point(key->id_4, "id4");
    print_g1_proof_point(key->lagrange_first, "lagrangeFirst");
    print_g1_proof_point(key->lagrange_last, "lagrangeLast", /*last=*/ true);
    os <<
        "        });\n"
        "        return vk;\n"
        "    }\n"
        "}\n";

    os << std::flush;
}
