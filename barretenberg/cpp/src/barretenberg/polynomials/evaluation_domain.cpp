// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 94f596f8b3bbbc216f9ad7dc33253256141156b2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "evaluation_domain.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/type_traits.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include <memory.h>
#include <memory>

namespace bb {

namespace {
constexpr size_t MIN_GROUP_PER_THREAD = 4;

size_t compute_num_threads(const size_t size)
{
    size_t num_threads = get_num_cpus_pow2();
    if (size <= (num_threads * MIN_GROUP_PER_THREAD)) {
        num_threads = 1;
    }

    return num_threads;
}

template <typename Fr>
void compute_lookup_table_single(const Fr& input_root,
                                 const size_t size,
                                 Fr* const roots,
                                 std::vector<Fr*>& round_roots)
{
    // num_rounds = 0 results in underflow in the loop below, so we require num_rounds >= 1, which is equivalent to size
    // >= 2.
    BB_ASSERT(size >= 2);
    const size_t num_rounds = static_cast<size_t>(numeric::get_msb(size));

    round_roots.reserve(num_rounds - 1);
    round_roots.emplace_back(&roots[0]);
    for (size_t i = 1; i < num_rounds - 1; ++i) {
        round_roots.emplace_back(round_roots.back() + (1UL << i));
    }

    for (size_t i = 0; i < num_rounds - 1; ++i) {
        const size_t m = 1UL << (i + 1);
        const Fr round_root = input_root.pow(static_cast<uint64_t>(size / (2 * m)));
        Fr* const current_round_roots = round_roots[i];
        current_round_roots[0] = Fr::one();
        for (size_t j = 1; j < m; ++j) {
            current_round_roots[j] = current_round_roots[j - 1] * round_root;
        }
    }
}
} // namespace

template <typename Fr>
EvaluationDomain<Fr>::EvaluationDomain(const size_t domain_size, const size_t target_generator_size)
    : size(domain_size)
    , num_threads(compute_num_threads(domain_size))
    , thread_size(domain_size / num_threads)
    , log2_size(static_cast<size_t>(numeric::get_msb(size)))
    , log2_thread_size(static_cast<size_t>(numeric::get_msb(thread_size)))
    , log2_num_threads(static_cast<size_t>(numeric::get_msb(num_threads)))
    , generator_size(target_generator_size ? target_generator_size : domain_size)
    , domain(Fr{ size, 0, 0, 0 }.to_montgomery_form())
    , domain_inverse(domain.invert())
    , generator(Fr::coset_generator())
    , generator_inverse(Fr::coset_generator().invert())
    , roots(nullptr)
{
    // Grumpkin does not have many roots of unity and, given these are not used for Honk, we set it to one.
    if (bb::IsAnyOf<Fr, grumpkin::fr>) {
        root = Fr::one();
    } else {
        root = Fr::get_root_of_unity(log2_size);
    }

    root_inverse = root.invert();

    BB_ASSERT((1UL << log2_size) == size || (size == 0));
    BB_ASSERT((1UL << log2_thread_size) == thread_size || (size == 0));
    BB_ASSERT((1UL << log2_num_threads) == num_threads || (size == 0));
}

template <typename Fr> EvaluationDomain<Fr>& EvaluationDomain<Fr>::operator=(EvaluationDomain&& other)
{
    // Prevent self-corruption of data
    if (this == &other) {
        return *this;
    }
    // Steal-and-zero the source's invariant-gating scalar fields. All validity checks on an
    // EvaluationDomain gate on `size > 0`, so zeroing it on move makes the source visibly empty
    // (matching the default-constructed state) rather than partially valid (size > 0 but
    // roots == nullptr).
    size = std::exchange(other.size, 0);
    generator_size = std::exchange(other.generator_size, 0);
    num_threads = std::exchange(other.num_threads, 0);
    thread_size = std::exchange(other.thread_size, 0);
    log2_size = std::exchange(other.log2_size, 0);
    log2_thread_size = std::exchange(other.log2_thread_size, 0);
    log2_num_threads = std::exchange(other.log2_num_threads, 0);
    Fr::__copy(other.root, root);
    Fr::__copy(other.root_inverse, root_inverse);
    Fr::__copy(other.domain, domain);
    Fr::__copy(other.domain_inverse, domain_inverse);
    Fr::__copy(other.generator, generator);
    Fr::__copy(other.generator_inverse, generator_inverse);
    roots = std::move(other.roots);
    round_roots = std::move(other.round_roots);
    inverse_round_roots = std::move(other.inverse_round_roots);
    other.roots = nullptr;
    return *this;
}

template <typename Fr> EvaluationDomain<Fr>::~EvaluationDomain() {}

template <typename Fr> void EvaluationDomain<Fr>::compute_lookup_table()
{
    BB_ASSERT_EQ(roots, nullptr);
    roots = std::make_shared<Fr[]>(size * 2);
    compute_lookup_table_single(root, size, roots.get(), round_roots);
    compute_lookup_table_single(root_inverse, size, &roots.get()[size], inverse_round_roots);
}

// explicitly instantiate both EvaluationDomain
template class EvaluationDomain<bb::fr>;
template class EvaluationDomain<grumpkin::fr>;

} // namespace bb
