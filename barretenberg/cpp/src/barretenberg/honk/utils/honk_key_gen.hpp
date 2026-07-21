// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/fields/field_conversion.hpp"
#include <array>
#include <ostream>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>

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

    const auto print_g1 = [&](const auto& element, const std::string& name, const bool last = false) {
        // Route through U256Codec so the EIP-196 canonical (0, 0) is emitted for
        // points at infinity (e.g. selectors that commit to identically-zero polys),
        // matching the proof-side transcript codec.
        const auto coords =
            bb::U256Codec::template serialize_to_fields<std::remove_cvref_t<decltype(element)>>(element);
        os << "            " << name << ": Honk.G1Point({ \n"
           << "               x: uint256(" << coords[0] << "),\n"
           << "               y: uint256(" << coords[1] << ")\n"
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
"// SPDX-License-Identifier: Apache-2.0\n"
      "// Copyright 2022 Aztec\n"
      "pragma solidity >=0.8.21;\n"
      "\n"
    "";
    print_types_import();
    print_u256_const(1 << key->log_circuit_size, "N");
    print_u256_const(key->log_circuit_size, "LOG_N");
    print_u256_const(key->num_public_inputs, "NUMBER_OF_PUBLIC_INPUTS");
    print_u256_const(key->hash(), "VK_HASH");
    os << ""
    "library " << class_name << " {\n"
      "    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {\n"
      "        Honk.VerificationKey memory vk = Honk.VerificationKey({\n";
    print_u256(1 << key->log_circuit_size, "circuitSize");
    print_u256(key->log_circuit_size, "logCircuitSize");
    print_u256(key->num_public_inputs, "publicInputsSize");
    using Commitment = std::remove_cvref_t<decltype(key->q_l())>;

    // (commitment, Solidity field name) pairs in on-chain VK struct order. The array length is the
    // single source of truth for the number of emitted G1 points; the static_assert pins it to the
    // flavor so adding/removing a precomputed entity fails to compile here rather than silently
    // drifting the emitted Solidity VK out of sync with the C++ layout.
    const auto precomputed_commitments = std::to_array<std::pair<Commitment, std::string_view>>({
        { key->q_l(), "ql" },
        { key->q_r(), "qr" },
        { key->q_o(), "qo" },
        { key->q_4(), "q4" },
        { key->q_m(), "qm" },
        { key->q_c(), "qc" },
        { key->q_lookup(), "qLookup" },
        { key->q_arith(), "qArith" },
        { key->q_delta_range(), "qDeltaRange" },
        { key->q_elliptic(), "qElliptic" },
        { key->q_memory(), "qMemory" },
        { key->q_nnf(), "qNnf" },
        { key->q_poseidon2_external(), "qPoseidon2External" },
        { key->q_poseidon2_internal(), "qPoseidon2Internal" },
        { key->sigma_1(), "s1" },
        { key->sigma_2(), "s2" },
        { key->sigma_3(), "s3" },
        { key->sigma_4(), "s4" },
        { key->table_1(), "t1" },
        { key->table_2(), "t2" },
        { key->table_3(), "t3" },
        { key->table_4(), "t4" },
        { key->id_1(), "id1" },
        { key->id_2(), "id2" },
        { key->id_3(), "id3" },
        { key->id_4(), "id4" },
        { key->lagrange_first(), "lagrangeFirst" },
        { key->lagrange_last(), "lagrangeLast" },
    });

    // lhs = no of precomputed commitments listed above
    // rhs = no of precomputed commitments in the verification key
    static_assert(std::tuple_size_v<decltype(precomputed_commitments)> ==
                      std::remove_cvref_t<decltype(*key)>::size(),
                  "honk_key_gen G1 emission list is out of sync with the flavor's precomputed entity count");

    // print the precomputed commitments
    for (size_t i = 0; i < precomputed_commitments.size(); ++i) {
        const auto& [commitment, name] = precomputed_commitments[i];
        print_g1(commitment, std::string(name), /*last=*/i + 1 == precomputed_commitments.size());
    }
    os <<
        "        });\n"
        "        return vk;\n"
        "    }\n"
        "}\n";

    os << std::flush;
}


