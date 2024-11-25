#include <fstream>
#include <iostream>
#include <string>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

using Builder = StandardCircuitBuilder;
using bool_t = bb::stdlib::bool_t<Builder>;
using field_t = bb::stdlib::field_t<Builder>;
using witness_t = bb::stdlib::witness_t<Builder>;
using public_witness_t = bb::stdlib::public_witness_t<Builder>;
using bigfield_t = bb::stdlib::bigfield<Builder, bb::Bn254FqParams>;

// reconstruct: bigfield_t(x)
// push_constant: bigfield_t(builder, value)
// push_witness: bigfield_T::from_wtieness(buidler, bb::fq(value))
// push_constant_witness: bigfield_t::crate_from_u512_as_witness(builder, uint256_t(value))
int main()
{
    Builder builder;

    bigfield_t w0 = bigfield_t::from_witness(
        &builder, bb::fq("0x2f4f04b4d0edc685ada2b1bb594909f9500c5e1120e5bd30147c5b7c7729ec01"));
    bigfield_t w1 = w0 + w0;
    bigfield_t w2 = w0 + w1;
    bigfield_t w3 = w0 + w0;
    w3 = w3 + w0;
    w3 = w3 + w3;
    bigfield_t w4 = w3 + w0;
    w3 = w3 + w3;
    w3 = w3 + w3;
    w3 = w3 + w4;
    w3 = w3 + w3;
    bigfield_t w5 = bigfield_t::from_witness(
        &builder, bb::fq("0x0c28c5b0fd61deff91d675b492dbc0c622cac046be41b6ac405d11ef2c799f0d"));
    w4.assert_is_not_equal(w1);

    w2 = w4.conditional_negate(bool_t(witness_t(&builder, true)));
    w4 = w2.conditional_negate(bool_t(witness_t(&builder, true)));

    w0 = w1.conditional_negate(bool_t(witness_t(&builder, true)));

    bigfield_t tmp = w2 - w1;
    w2.assert_equal(tmp + w1);

    tmp = w5 - w4;
    w5.assert_equal(tmp + w4);

    bigfield_t w6 = bigfield_t::create_from_u512_as_witness(
        &builder, uint256_t("0x286b3cd344d8bc741f60a1ec4e114e56f10535779f56339bef7fa109038857fc"));

    w4 = w1.conditional_negate(bool_t(witness_t(&builder, false)));
    w5 = w3.conditional_negate(bool_t(witness_t(&builder, false)));

    w3 = w5.conditional_select(w5, bool_t(witness_t(&builder, false)));

    w4 = w5.conditional_negate(bool_t(witness_t(&builder, true)));
    w4 = w5.conditional_negate(bool_t(witness_t(&builder, true)));

    w4 = w0.conditional_select(w4, bool_t(witness_t(&builder, false)));

    bigfield_t w8 = w3 - w3;
    info(w8);

    w2 = w0.conditional_select(w5, bool_t(witness_t(&builder, true)));

    bigfield_t c9 = bigfield_t(&builder, bb::fq("0x2305ef3d8defe0868de373a382e1cc67b9259ef39fef37de03fe0f3f6f0f057c"));

    bigfield_t w10 = w8 / w6;
    info("uint256_t dlimb0_value = \"", w6.binary_basis_limbs[0].element, "\";");
    info("uint256_t dlimb0_max = \"", w6.binary_basis_limbs[0].maximum_value, "\";");
    info("uint256_t dlimb1_value = \"", w6.binary_basis_limbs[1].element, "\";");
    info("uint256_t dlimb1_max = \"", w6.binary_basis_limbs[1].maximum_value, "\";");
    info("uint256_t dlimb2_value = \"", w6.binary_basis_limbs[2].element, "\";");
    info("uint256_t dlimb2_max = \"", w6.binary_basis_limbs[2].maximum_value, "\";");
    info("uint256_t dlimb3_value = \"", w6.binary_basis_limbs[3].element, "\";");
    info("uint256_t dlimb3_max = \"", w6.binary_basis_limbs[3].maximum_value, "\";");

    info("uint256_t nlimb0_value = \"", w8.binary_basis_limbs[0].element, "\";");
    info("uint256_t nlimb0_max = \"", w8.binary_basis_limbs[0].maximum_value, "\";");
    info("uint256_t nlimb1_value = \"", w8.binary_basis_limbs[1].element, "\";");
    info("uint256_t nlimb1_max = \"", w8.binary_basis_limbs[1].maximum_value, "\";");
    info("uint256_t nlimb2_value = \"", w8.binary_basis_limbs[2].element, "\";");
    info("uint256_t nlimb2_max = \"", w8.binary_basis_limbs[2].maximum_value, "\";");
    info("uint256_t nlimb3_value = \"", w8.binary_basis_limbs[3].element, "\";");
    info("uint256_t nlimb3_max = \"", w8.binary_basis_limbs[3].maximum_value, "\";");

    info("denominator = ", w6.prime_basis_limb);
    info("denominator = ", w6);
    info("numerator = ", w8.prime_basis_limb);
    info("numerator = ", w8);

    (void)w10;

    info(CircuitChecker::check(builder));
    info(builder.get_num_gates());
    info(builder._err);
}