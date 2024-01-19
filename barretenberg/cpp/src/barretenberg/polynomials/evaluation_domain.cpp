#include "evaluation_domain.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
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
    const size_t num_rounds = static_cast<size_t>(numeric::get_msb(size));

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
    , generator(Fr::coset_generator(0))
    , generator_inverse(Fr::coset_generator(0).invert())
    , four_inverse(Fr(4).invert())
    , roots(nullptr)
{
    // Grumpkin does not have many roots of unity and, given these are not used for Honk, we set it to one.
    if (bb::IsAnyOf<Fr, grumpkin::fr>) {
        root = Fr::one();
    } else {
        root = Fr::get_root_of_unity(log2_size);
    }

    root_inverse = root.invert();

    ASSERT((1UL << log2_size) == size || (size == 0));
    ASSERT((1UL << log2_thread_size) == thread_size || (size == 0));
    ASSERT((1UL << log2_num_threads) == num_threads || (size == 0));
}

template <typename Fr>
EvaluationDomain<Fr>::EvaluationDomain(const EvaluationDomain& other)
    : size(other.size)
    , num_threads(compute_num_threads(other.size))
    , thread_size(other.size / num_threads)
    , log2_size(static_cast<size_t>(numeric::get_msb(size)))
    , log2_thread_size(static_cast<size_t>(numeric::get_msb(thread_size)))
    , log2_num_threads(static_cast<size_t>(numeric::get_msb(num_threads)))
    , generator_size(other.generator_size)
    , root(Fr::get_root_of_unity(log2_size))
    , root_inverse(root.invert())
    , domain(Fr{ size, 0, 0, 0 }.to_montgomery_form())
    , domain_inverse(domain.invert())
    , generator(other.generator)
    , generator_inverse(other.generator_inverse)
    , four_inverse(other.four_inverse)
{
    ASSERT((1UL << log2_size) == size);
    ASSERT((1UL << log2_thread_size) == thread_size);
    ASSERT((1UL << log2_num_threads) == num_threads);
    if (other.roots != nullptr) {
        const size_t mem_size = sizeof(Fr) * size * 2;
        roots = std::static_pointer_cast<Fr[]>(get_mem_slab(mem_size));
        memcpy(static_cast<void*>(roots.get()), static_cast<void*>(other.roots.get()), mem_size);
        round_roots.resize(log2_size - 1);
        inverse_round_roots.resize(log2_size - 1);
        round_roots[0] = &roots[0];
        inverse_round_roots[0] = &roots.get()[size];
        for (size_t i = 1; i < log2_size - 1; ++i) {
            round_roots[i] = round_roots[i - 1] + (1UL << i);
            inverse_round_roots[i] = inverse_round_roots[i - 1] + (1UL << i);
        }
    } else {
        roots = nullptr;
    }
}

template <typename Fr>
EvaluationDomain<Fr>::EvaluationDomain(EvaluationDomain&& other)
    : size(other.size)
    , num_threads(compute_num_threads(other.size))
    , thread_size(other.size / num_threads)
    , log2_size(static_cast<size_t>(numeric::get_msb(size)))
    , log2_thread_size(static_cast<size_t>(numeric::get_msb(thread_size)))
    , log2_num_threads(static_cast<size_t>(numeric::get_msb(num_threads)))
    , generator_size(other.generator_size)
    , root(Fr::get_root_of_unity(log2_size))
    , root_inverse(root.invert())
    , domain(Fr{ size, 0, 0, 0 }.to_montgomery_form())
    , domain_inverse(domain.invert())
    , generator(other.generator)
    , generator_inverse(other.generator_inverse)
    , four_inverse(other.four_inverse)
{
    roots = other.roots;
    round_roots = std::move(other.round_roots);
    inverse_round_roots = std::move(other.inverse_round_roots);
    other.roots = nullptr;
}

template <typename Fr> EvaluationDomain<Fr>& EvaluationDomain<Fr>::operator=(EvaluationDomain&& other)
{
    size = other.size;
    generator_size = other.generator_size;
    num_threads = compute_num_threads(other.size);
    thread_size = other.size / num_threads;
    log2_size = static_cast<size_t>(numeric::get_msb(size));
    log2_thread_size = static_cast<size_t>(numeric::get_msb(thread_size));
    log2_num_threads = static_cast<size_t>(numeric::get_msb(num_threads));
    Fr::__copy(other.root, root);
    Fr::__copy(other.root_inverse, root_inverse);
    Fr::__copy(other.domain, domain);
    Fr::__copy(other.domain_inverse, domain_inverse);
    Fr::__copy(other.generator, generator);
    Fr::__copy(other.generator_inverse, generator_inverse);
    Fr::__copy(other.four_inverse, four_inverse);
    roots = nullptr;
    if (other.roots != nullptr) {
        roots = other.roots;
        round_roots = std::move(other.round_roots);
        inverse_round_roots = std::move(other.inverse_round_roots);
    }
    other.roots = nullptr;
    return *this;
}

template <typename Fr> EvaluationDomain<Fr>::~EvaluationDomain() {}

template <typename Fr> void EvaluationDomain<Fr>::compute_lookup_table()
{
    ASSERT(roots == nullptr);
    // roots = (Fr*)(aligned_alloc(32, sizeof(Fr) * size * 2));
    roots = std::static_pointer_cast<Fr[]>(get_mem_slab(sizeof(Fr) * size * 2));
    compute_lookup_table_single(root, size, roots.get(), round_roots);
    compute_lookup_table_single(root_inverse, size, &roots.get()[size], inverse_round_roots);
}

// explicitly instantiate both EvaluationDomain
template class EvaluationDomain<bb::fr>;
template class EvaluationDomain<grumpkin::fr>;

} // namespace bb
