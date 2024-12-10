#include "barretenberg/common/thread.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include "barretenberg/vm/avm/generated/full_row.hpp"
#include "barretenberg/vm/avm/generated/relations/poseidon2.hpp"
#include "barretenberg/vm/avm/generated/relations/poseidon2_full.hpp"

#include "barretenberg/vm/avm/trace/gadgets/merkle_tree.hpp"
#include <cstdint>
#include <cstdlib>
#include <gtest/gtest.h>

namespace tests_avm {
using namespace bb;
using namespace bb::avm;

TEST(AvmMerkleTree, shouldCheckMembership)
{

    using FF = AvmFlavor::FF;
    constexpr size_t TRACE_SIZE = 1 << 8;

    std::vector<AvmFullRow<FF>> trace(TRACE_SIZE);

    bb::avm_trace::AvmMerkleTreeTraceBuilder merkle_tree_builder;
    std::cerr << "Generating trace of size " << TRACE_SIZE << "..." << std::endl;

    // TODO: Define a static test vector for merkle tree
    /* MEMBERSHIP CHECK */
    // Create a bunch of random elements and hash them.
    size_t depth = 32;
    std::vector<FF> sibling_path;
    FF initial_value = FF::random_element();
    uint32_t leaf_index = 2000;
    for (size_t i = 0; i < depth; ++i) {
        sibling_path.push_back(FF::random_element());
    }
    FF root = initial_value;
    uint32_t leaf_index_copy = leaf_index;
    for (size_t i = 0; i < depth; ++i) {
        root = leaf_index_copy % 2 == 0
                   ? crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ root, sibling_path[i] })
                   : crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ sibling_path[i], root });
        leaf_index_copy /= 2;
    }

    // Check membership
    bool found = merkle_tree_builder.check_membership(0, initial_value, leaf_index, sibling_path, root);
    ASSERT_TRUE(found);

    /* UPDATE ROOT */
    FF new_value = FF::random_element();
    FF new_root = merkle_tree_builder.update_leaf_index(2, new_value, leaf_index, sibling_path);
    bool new_found = merkle_tree_builder.check_membership(3, new_value, leaf_index, sibling_path, new_root);
    ASSERT_TRUE(new_found);

    merkle_tree_builder.poseidon2_builder.finalize_full(trace);
    auto finalised_builder = merkle_tree_builder.poseidon2_builder.finalize();
    for (size_t i = 0; i < finalised_builder.size(); i++) {
        auto& dest = trace.at(i);
        auto const& src = finalised_builder.at(i);
        dest.poseidon2_clk = FF(src.clk);
        merge_into(dest, src);
    }

    merkle_tree_builder.finalize(trace);

    trace.insert(trace.begin(), bb::AvmFullRow<bb::fr>{ .main_sel_first = FF(1), .mem_lastAccess = FF(1) });
    // We build the polynomials needed to run "sumcheck".
    AvmCircuitBuilder cb;
    cb.set_trace(std::move(trace));
    auto polys = cb.compute_polynomials();
    const size_t num_rows = polys.get_polynomial_size();
    std::cerr << "Done computing polynomials..." << std::endl;

    std::cerr << "Accumulating relations..." << std::endl;
    using AllRelations = std::tuple<avm::merkle_tree<FF>, avm::poseidon2_full<FF>, avm::poseidon2<FF>>;

    bb::constexpr_for<0, std::tuple_size_v<AllRelations>, 1>([&]<size_t i>() {
        using Relation = std::tuple_element_t<i, AllRelations>;
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
    });

    std::cerr << "Accumulating permutation relations..." << std::endl;

    const FF gamma = FF::random_element();
    const FF beta = FF::random_element();
    bb::RelationParameters<typename AvmFlavor::FF> params{
        .beta = beta,
        .gamma = gamma,
    };
    using PermRelations = perm_merkle_poseidon2_relation<FF>;

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
