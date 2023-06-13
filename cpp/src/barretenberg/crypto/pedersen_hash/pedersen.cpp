#include "./pedersen.hpp"
#include <iostream>
#ifndef NO_OMP_MULTITHREADING
#include <omp.h>
#endif

namespace crypto {
namespace pedersen_hash {

using namespace generators;

grumpkin::g1::element hash_single(const barretenberg::fr& in, generator_index_t const& index)
{
    auto gen_data = get_generator_data(index);
    barretenberg::fr scalar_multiplier = in.from_montgomery_form();

    constexpr size_t num_bits = 254;
    constexpr size_t num_quads_base = (num_bits - 1) >> 1;
    constexpr size_t num_quads = ((num_quads_base << 1) + 1 < num_bits) ? num_quads_base + 1 : num_quads_base;
    constexpr size_t num_wnaf_bits = (num_quads << 1) + 1;

    const fixed_base_ladder* ladder = gen_data.get_hash_ladder(num_bits);

    uint64_t wnaf_entries[num_quads + 2] = { 0 };
    bool skew = false;
    barretenberg::wnaf::fixed_wnaf<num_wnaf_bits, 1, 2>(&scalar_multiplier.data[0], &wnaf_entries[0], skew, 0);

    grumpkin::g1::element accumulator;
    accumulator = grumpkin::g1::element(ladder[0].one);
    if (skew) {
        accumulator -= gen_data.skew_generator;
    }

    for (size_t i = 0; i < num_quads; ++i) {
        uint64_t entry = wnaf_entries[i + 1];
        const grumpkin::g1::affine_element& point_to_add =
            ((entry & WNAF_MASK) == 1) ? ladder[i + 1].three : ladder[i + 1].one;
        uint64_t predicate = (entry >> 31U) & 1U;
        accumulator.self_mixed_add_or_sub(point_to_add, predicate);
    }
    return accumulator;
}

/**
 * Given a vector of fields, generate a pedersen hash using the indexed generators.
 */
grumpkin::fq hash_multiple(const std::vector<grumpkin::fq>& inputs, const size_t hash_index)
{
    ASSERT((inputs.size() < (1 << 16)) && "too many inputs for 16 bit index");
    std::vector<grumpkin::g1::element> out(inputs.size());

#ifndef NO_OMP_MULTITHREADING
    // Ensure generator data is initialized before threading...
    init_generator_data();
#pragma omp parallel for num_threads(inputs.size())
#endif
    for (size_t i = 0; i < inputs.size(); ++i) {
        generator_index_t index = { hash_index, i };
        out[i] = hash_single(inputs[i], index);
    }

    grumpkin::g1::element r = out[0];
    for (size_t i = 1; i < inputs.size(); ++i) {
        r = out[i] + r;
    }
    grumpkin::g1::affine_element result =
        r.is_point_at_infinity() ? grumpkin::g1::affine_element(0, 0) : grumpkin::g1::affine_element(r);
    return result.x;
}

} // namespace pedersen_hash
} // namespace crypto