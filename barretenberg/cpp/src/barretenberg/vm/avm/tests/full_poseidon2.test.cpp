
#include "barretenberg/common/thread.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include "barretenberg/vm/avm/generated/full_row.hpp"
#include "barretenberg/vm/avm/trace/fixed_powers.hpp"

#include "barretenberg/vm/avm/trace/gadgets/poseidon2.hpp"
#include <cstdint>
#include <gtest/gtest.h>

namespace tests_avm {
using namespace bb;
using namespace bb::avm;

TEST(AvmFullPoseidon2, shouldHashCorrectly)
{

    using FF = AvmFlavor::FF;
    constexpr size_t TRACE_SIZE = 1 << 8;

    std::vector<AvmFullRow<FF>> trace(TRACE_SIZE);

    bb::avm_trace::AvmPoseidon2TraceBuilder poseidon2_builder;
    std::cerr << "Generating trace of size " << TRACE_SIZE << "..." << std::endl;

    // Create a bunch of random elements and hash them.
    size_t num_elems = 10;
    std::vector<FF> random_elems;
    uint32_t clk = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        for (size_t i = 0; i < num_elems; ++i) {
            random_elems.push_back(FF::random_element());
        }
        FF builder_result = poseidon2_builder.poseidon2_hash(random_elems, static_cast<uint32_t>(clk));
        FF expected_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(random_elems);
        EXPECT_EQ(builder_result, expected_result);
        clk += i + (static_cast<uint32_t>(random_elems.size()) + 2) / 3 * 3;
    }

    poseidon2_builder.finalize_full(trace);
    auto finalised_builder = poseidon2_builder.finalize();
    for (size_t i = 0; i < finalised_builder.size(); i++) {
        auto& dest = trace.at(i);
        auto const& src = finalised_builder.at(i);
        dest.poseidon2_clk = FF(src.clk);
        merge_into(dest, src);
    }

    trace.insert(trace.begin(), bb::AvmFullRow<bb::fr>{ .main_sel_first = FF(1), .mem_lastAccess = FF(1) });
    // We build the polynomials needed to run "sumcheck".
    AvmCircuitBuilder cb;
    cb.set_trace(std::move(trace));
    auto polys = cb.compute_polynomials();
    const size_t num_rows = polys.get_polynomial_size();
    std::cerr << "Done computing polynomials..." << std::endl;

    std::cerr << "Accumulating relations..." << std::endl;
    using Relation = avm::poseidon2_full<FF>;

    typename Relation::SumcheckArrayOfValuesOverSubrelations result;
    for (auto& r : result) {
        r = 0;
    }

    // We set the conditions up there.
    for (size_t r = 0; r < num_rows; ++r) {
        Relation::accumulate(result, polys.get_row(r), {}, 1);
    }

    for (size_t j = 0; j < result.size(); ++j) {
        if (result[j] != 0) {
            EXPECT_EQ(result[j], 0) << "Relation " << Relation::NAME << " subrelation "
                                    << Relation::get_subrelation_label(j) << " was expected to be zero.";
        }
    }

    std::cerr << "Accumulating permutation relations..." << std::endl;

    const FF gamma = FF::random_element();
    const FF beta = FF::random_element();
    bb::RelationParameters<typename AvmFlavor::FF> params{
        .beta = beta,
        .gamma = gamma,
    };
    using PermRelations = perm_pos2_fixed_pos2_perm_relation<FF>;

    // Check the logderivative relation
    bb::compute_logderivative_inverse<AvmFlavor, PermRelations>(polys, params, num_rows);

    typename PermRelations::SumcheckArrayOfValuesOverSubrelations lookup_result;

    for (auto& r : lookup_result) {
        r = 0;
    }
    for (size_t r = 0; r < num_rows; ++r) {
        PermRelations::accumulate(lookup_result, polys.get_row(r), params, 1);
    }
    for (const auto& j : lookup_result) {
        if (j != 0) {
            EXPECT_EQ(j, 0) << "Lookup Relation " << PermRelations::NAME << " subrelation ";
        }
    }
}

} // namespace tests_avm
