#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Bundle of precomputed VKs returned by `precompute_vks`.
 */
struct PrecomputedVks {
    std::vector<Chonk::CircuitVerificationKey> per_circuit_vks;
};

std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> accumulate_and_prove_with_precomputed_vks(
    PrivateFunctionExecutionMockCircuitProducer& circuit_producer, const PrecomputedVks& precomputed_vks)
{
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    Chonk ivc{ NUM_CIRCUITS };

    BB_ASSERT_EQ(
        precomputed_vks.per_circuit_vks.size(), NUM_CIRCUITS, "There should be a precomputed VK for each circuit");

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        MegaCircuitBuilder circuit;
        {
            BB_BENCH_NAME("construct_circuits");
            circuit = circuit_producer.create_next_circuit(ivc);
        }
        ivc.accumulate(circuit, ivc.next_circuit_kind(), precomputed_vks.per_circuit_vks[circuit_idx]);
    }
    return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
}

/**
 * @brief Perform a specified number of circuit accumulation rounds
 *
 * @param num_app_circuits Number of app circuits to accumulate
 */
std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> accumulate_and_prove_with_precomputed_vks(
    size_t num_app_circuits, const PrecomputedVks& precomputed_vks, const bool large_first_app = true)
{
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(num_app_circuits, large_first_app);
    return accumulate_and_prove_with_precomputed_vks(circuit_producer, precomputed_vks);
}

std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> accumulate_and_prove_with_precomputed_vks(
    std::vector<bool> leading_is_kernel_flags,
    const PrecomputedVks& precomputed_vks,
    const bool large_first_app = false)
{
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(std::move(leading_is_kernel_flags), large_first_app);
    return accumulate_and_prove_with_precomputed_vks(circuit_producer, precomputed_vks);
}

inline PrecomputedVks precompute_vks(PrivateFunctionExecutionMockCircuitProducer& circuit_producer)
{
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    Chonk ivc{ NUM_CIRCUITS };

    PrecomputedVks out;
    out.per_circuit_vks.reserve(NUM_CIRCUITS);
    for (size_t j = 0; j < NUM_CIRCUITS; ++j) {
        auto circuit = circuit_producer.create_next_circuit(ivc);
        const Chonk::CircuitKind kind = ivc.next_circuit_kind();

        Chonk::CircuitVerificationKey vk = dispatch_kind(kind, [&]<Chonk::CircuitKind K>() {
            using FlavorT = flavor_for<K>;
            using VK = typename FlavorT::VerificationKey;
            MegaCircuitBuilder_<bb::fr> builder{ circuit };
            builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
            return Chonk::CircuitVerificationKey{ std::make_shared<VK>(
                ProverInstance_<FlavorT>(builder).get_precomputed()) };
        });

        out.per_circuit_vks.push_back(vk);
        ivc.accumulate(circuit, kind, vk);
    }

    return out;
}

inline PrecomputedVks precompute_vks(const size_t num_app_circuits, const bool large_first_app = true)
{
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(num_app_circuits, large_first_app);
    return precompute_vks(circuit_producer);
}

inline PrecomputedVks precompute_vks(std::vector<bool> leading_is_kernel_flags, const bool large_first_app = false)
{
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(std::move(leading_is_kernel_flags), large_first_app);
    return precompute_vks(circuit_producer);
}

} // namespace bb
