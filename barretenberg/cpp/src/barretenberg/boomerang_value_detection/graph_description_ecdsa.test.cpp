#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"

using namespace bb;
using namespace bb::crypto;
using namespace cdg;

using Builder = UltraCircuitBuilder;
using curve_ = stdlib::secp256k1<Builder>;
using curveR1 = stdlib::secp256r1<Builder>;

TEST(Boomerang_ECDSA, verify_signature)
{
    Builder builder = Builder();

    // whaaablaghaaglerijgeriij
    std::string message_string = "Instructions unclear, ask again later.";

    ecdsa_key_pair<curve_::fr, curve_::g1> account;
    account.private_key = curve_::fr::random_element();
    account.public_key = curve_::g1::one * account.private_key;

    ecdsa_signature signature =
        ecdsa_construct_signature<Sha256Hasher, curve_::fq, curve_::fr, curve_::g1>(message_string, account);

    curve_::g1_bigfr_ct public_key = curve_::g1_bigfr_ct::from_witness(&builder, account.public_key);

    std::vector<uint8_t> rr(signature.r.begin(), signature.r.end());
    std::vector<uint8_t> ss(signature.s.begin(), signature.s.end());
    std::vector<uint8_t> vv = { signature.v };

    stdlib::ecdsa_signature<Builder> sig{ curve_::byte_array_ct(&builder, rr),
                                          curve_::byte_array_ct(&builder, ss),
                                          curve_::byte_array_ct(&builder, vv) };

    curve_::byte_array_ct message(&builder, message_string);

    curve_::bool_ct signature_result =
        stdlib::ecdsa_verify_signature<Builder, curve_, curve_::fq_ct, curve_::bigfr_ct, curve_::g1_bigfr_ct>(
            message, public_key, sig);
    EXPECT_EQ(signature_result.get_value(), true);
    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
    builder.finalize_circuit(false);
    auto tool = cdg::StaticAnalyzer(builder);
    auto variables_in_one_gate = tool.get_variables_in_one_gate();
    auto connected_components = tool.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    EXPECT_EQ(variables_in_one_gate.size(), 6);
    if (variables_in_one_gate.size() > 0) {
        for (const auto& elem : variables_in_one_gate) {
            info("elem == ", elem);
        }
    }
}
