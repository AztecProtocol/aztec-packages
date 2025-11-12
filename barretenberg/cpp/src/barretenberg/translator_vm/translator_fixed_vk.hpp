// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"

namespace bb {

/**
 * @brief Stores the fixed Translator VK commitments (to precomputed polynomials) that depend only on the circuit size
 * constant CONST_TRANSLATOR_LOG_N.
 * @details If the constant CONST_TRANSLATOR_LOG_N changes, these commitments must be updated accordingly. Their values
 * can be obtained from the test TranslatorTests::FixedVK.
 *
 */
struct TranslatorFixedVKCommitments {
    using Commitment = curve::BN254::AffineElement;

    static std::vector<Commitment> get_all()
    {
        return {
            // ordered_extra_range_constraints_numerator
            Commitment(uint256_t("0x1ddbff0e1f0999f88ffa959e9505e5f489b57d6a7937c17a4d69fc871d5e9221"),
                       uint256_t("0x14149055853422bf016065386e8ea0ffb9425b454048e1cd14cfdca457aa7e17")),

            // lagrange_first
            Commitment(uint256_t("0x0000000000000000000000000000000000000000000000000000000000000001"),
                       uint256_t("0x0000000000000000000000000000000000000000000000000000000000000002")),

            // 1) lagrange_last  (updated)
            Commitment(uint256_t("0x0b91db670af249ea43bf35a192f139f7d7506fbc37fbeb19daf9175a52bd37d1"),
                       uint256_t("0x249db0a866cc29c2490881d2eeb1ac6ae30a5902bc272f02695953997b6d2e2e")),

            // 2) lagrange_odd_in_minicircuit  (updated)
            Commitment(uint256_t("0x074416f297ac484a550b0c1a03e2fa105ec917c2a682756e3d26b22258cd2b97"),
                       uint256_t("0x1ca1c180bc48235518bf4ee2d7511bd21efc121581c5d2cc1fb5a30645e23dcd")),

            // 3) lagrange_even_in_minicircuit  (updated)
            Commitment(uint256_t("0x0e592a2a12aef6034b950f4f74ea34efbc8989333c100ea6ff49d816f34f4b96"),
                       uint256_t("0x29839134d945c4586b216ea4e0baeafcce798c8ed7229efbee2827eb542392b7")),

            // lagrange_result_row
            Commitment(uint256_t("0x2c4e3788efe883d91b423233818890599ad233cecf88be80debce9e5ac727e29"),
                       uint256_t("0x0d79fb9abbbde1fdb4c53d148cfcf083e84f3153e6817f5a19f0560e831dda8f")),

            // 4) lagrange_last_in_minicircuit  (updated)
            Commitment(uint256_t("0x19cce0459cdb5d34dc78edfc65a309f7b5f2e3f2143bb69f0ac7e77ee653d1a5"),
                       uint256_t("0x11b8ced4eb4fd3db1b68e7b439f33a28a3c771d6b9a405e26ed63957b8b4ac95")),

            // 5) lagrange_masking  (updated)
            Commitment(uint256_t("0x262468705c0bba548f33898a45c9981223419e337f5020c9667237cc92ecd332"),
                       uint256_t("0x2a0672531c488dc9f16dd660b3554ac51539fe8817238051b7ea1a6133a8bc88")),

            // 6) lagrange_mini_masking  (updated)
            Commitment(uint256_t("0x2006473957740f821233b54dbf2aa5630e66478691c26168344b34096c040ad0"),
                       uint256_t("0x1246f1a3d5140bfeb529ddb7f016b9c6604bec72dfcf4b1fc3f11b036b38d46f")),

            // 7) lagrange_real_last  (updated)
            Commitment(uint256_t("0x1e6ee0411de077adf17e86510d34d319b1d26dfb0c16494ce1f6e2e3bf093527"),
                       uint256_t("0x2685bec825c699d51d363a516cef34af71c221d7f1c6868850fae8197efb02ca")),
        };
    }
};

} // namespace bb
