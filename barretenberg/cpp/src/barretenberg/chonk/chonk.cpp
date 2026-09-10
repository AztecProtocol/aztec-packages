#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/memory_profile.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include <array>

namespace bb {

#ifndef NDEBUG
template <typename NativeFlavor>
void Chonk::run_native_instance_sumcheck(const std::shared_ptr<typename NativeFlavor::VerificationKey>& honk_vk,
                                         const VerifierInputs& queue_entry)
{
    auto verifier_inst =
        std::make_shared<VerifierInstance_<NativeFlavor>>(std::make_shared<typename NativeFlavor::VKAndHash>(honk_vk));

    // Cross-check the prover's instance claim against the native verifier's, claim by claim, as the group is built.
    // The group's claims are folded together before the next kernel (see update_native_verifier_accumulator).
    bool sumcheck_verified =
        native_folding_verifier->template accumulate_instance<NativeFlavor>(verifier_inst, queue_entry.proof);
    info("Sumcheck: instance to accumulator verified: ", sumcheck_verified ? "true" : "false");

    info("Chonk accumulate: prover and verifier sumcheck claims match: ",
         folding_prover->get_cached_claims().back().compare_with_verifier_claim(
             native_folding_verifier->get_cached_claims().back())
             ? "true"
             : "false");
}

template <typename InstanceFlavor>
void Chonk::debug_incoming_circuit(typename InstanceFlavor::CircuitBuilder& circuit,
                                   const std::shared_ptr<ProverInstance_<InstanceFlavor>>& prover_instance,
                                   const std::shared_ptr<typename InstanceFlavor::VerificationKey>& precomputed_vk)
{
    info("======= DEBUGGING INFO FOR INCOMING CIRCUIT =======");

    info("Accumulating circuit ", num_circuits_accumulated + 1, " of ", num_circuits);
    info("Is the circuit valid? ", CircuitChecker::check(circuit) ? "true" : "false");
    info("Did we find a failure? ", circuit.failed() ? "true" : "false");
    if (circuit.failed()) {
        info("\t\t\tError message? ", circuit.err());
    }

    // Compare precomputed VK with the one generated during accumulation.
    auto vk = std::make_shared<typename InstanceFlavor::VerificationKey>(prover_instance->get_precomputed());
    info("Does the precomputed vk match with the one generated during accumulation? ",
         vk->compare(*precomputed_vk, typename InstanceFlavor::CommitmentLabels().get_precomputed()) ? "true"
                                                                                                     : "false");

    info("======= END OF DEBUGGING INFO FOR INCOMING CIRCUIT =======");
}

void Chonk::verify_native_instance_sumcheck(const VerifierInputs& queue_entry)
{
    info("======= DEBUGGING INFO FOR NATIVE SUMCHECK STEP =======");

    if (queue_entry.is_kernel()) {
        run_native_instance_sumcheck<KernelFlavor>(queue_entry.kernel_honk_vk, queue_entry);
    } else {
        run_native_instance_sumcheck<AppFlavor>(queue_entry.app_honk_vk, queue_entry);
    }

    info("======= END OF DEBUGGING INFO FOR NATIVE SUMCHECK STEP =======");
}

void Chonk::update_native_verifier_accumulator(bool is_init_group)
{
    info("======= DEBUGGING INFO FOR NATIVE MULTILINEAR BATCHING STEP =======");

    // Finalise the native cross-check verifier over the same claims the prover folded (the previous accumulator, absent
    // for the init group, followed by the group's claims). For a single-claim group the batching proof is empty.
    std::optional<VerifierAccumulator> previous_accumulator =
        is_init_group ? std::nullopt : std::optional<VerifierAccumulator>(std::move(native_verifier_accum));
    auto [batching_verified, new_accumulator] =
        native_folding_verifier->finalize(multilinear_batch_proof, std::move(previous_accumulator));
    native_verifier_accum = std::move(new_accumulator);
    native_folding_verifier.reset();
    info("Multilinear batching: claims to accumulator verified: ", batching_verified ? "true" : "false");

    info("Chonk accumulate: prover and verifier accumulators match: ",
         prover_accumulator.compare_with_verifier_claim(native_verifier_accum) ? "true" : "false");

    Transcript hash_transcript;
    info("Chonk accumulate: hash of verifier accumulator computed natively: ",
         native_verifier_accum.hash_with_origin_tagging(hash_transcript));

    info("======= END OF DEBUGGING INFO FOR NATIVE MULTILINEAR BATCHING STEP =======");
}

void Chonk::verify_decider_natively()
{
    info("======= DEBUGGING INFO FOR NATIVE DECIDER STEP =======");

    HypernovaDeciderVerifier<KernelFlavor> decider_verifier(native_verifier_accumulation_transcript);
    bb::PairingPoints<curve::BN254> pairing_points =
        decider_verifier.verify_proof(native_verifier_accum, decider_proof);
    info("Decider: pairing points verified? ", pairing_points.check() ? "true" : "false");

    info("======= END OF DEBUGGING INFO FOR NATIVE DECIDER STEP =======");
}
#endif

// Constructor
Chonk::Chonk(std::vector<CircuitKind> circuit_kinds)
    : circuit_kinds(std::move(circuit_kinds))
    , num_circuits(this->circuit_kinds.size())
{
    // Not BB_ASSERTs: the kinds arrive from msgpack (ChonkStart::kinds / folding stack). A stack with fewer
    // than 4 circuits cannot hold the app + init/tail/hiding kernel structure the IVC requires, so reject
    // malformed stacks clearly in release/WASM too.
    if (num_circuits < 4U) {
        throw_or_abort("Chonk: number of circuits must be at least 4, got " + std::to_string(num_circuits));
    }

    for (size_t idx = 0; idx < num_circuits; ++idx) {
        const CircuitKind kind = this->circuit_kinds[idx];
        const bool is_valid_kind =
            kind == CircuitKind::App || kind == CircuitKind::Kernel || kind == CircuitKind::HidingKernel;
        if (!is_valid_kind) {
            throw_or_abort("Chonk: invalid CircuitKind at position " + std::to_string(idx));
        }
        const bool is_valid_hiding_kernel_position = (kind == CircuitKind::HidingKernel) == (idx == num_circuits - 1);
        if (!is_valid_hiding_kernel_position) {
            throw_or_abort("Chonk: HidingKernel must be the final circuit in the IVC stack and nowhere else");
        }
        const bool is_first_circuit_app = this->circuit_kinds.front() == CircuitKind::App;
        if (!is_first_circuit_app) {
            throw_or_abort("Chonk: the first circuit in the IVC stack must be an app");
        }
    }
}

/**
 * @brief Build the hiding kernel's ZK proving key and verification key (proving is deferred to prove()).
 */
void Chonk::accumulate_hiding_kernel(HidingKernelCircuit& circuit,
                                     const std::shared_ptr<MegaZKVerificationKey>& precomputed_vk)
{
    BB_BENCH_NAME("Chonk::accumulate_hiding_kernel");
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "Chonk: Attempting to accumulate more circuits than expected.");
    // throw, not BB_ASSERT: reachable from external step ordering, and a wrong position would feed
    // the wrong variant alternative into std::get below (std::bad_variant_access / mis-folding).
    if (!is_hiding_kernel()) {
        throw_or_abort("Chonk::accumulate_hiding_kernel must be the final circuit in the IVC stack");
    }

    vinfo("Constructing hiding kernel instance (proving deferred to prove())");
    hiding_prover_inst = std::make_shared<HidingKernelProverInstance>(circuit);

    // The circuit has been copied into the prover polynomials; free its construction data.
    circuit.free_construction_data();

    if (precomputed_vk) {
#ifndef NDEBUG
        auto computed_vk = std::make_shared<MegaZKVerificationKey>(hiding_prover_inst->get_precomputed());
        BB_ASSERT(*precomputed_vk == *computed_vk,
                  "Chonk::accumulate_hiding_kernel - precomputed MegaZK VK does not match computed VK");
#endif
        hiding_vk = precomputed_vk;
    } else {
        hiding_vk = std::make_shared<MegaZKVerificationKey>(hiding_prover_inst->get_precomputed());
    }
    num_circuits_accumulated++;
}

// Templated body of accumulate_and_fold. Dispatched on InstanceFlavor (MegaAppFlavor for apps,
// MegaKernelFlavor for kernels). The Hypernova accumulator is flavor-agnostic so apps and kernels
// fold into the same `prover_accumulator`.
template <typename InstanceFlavor>
HonkProof Chonk::instance_to_accumulator(typename InstanceFlavor::CircuitBuilder& circuit,
                                         const std::shared_ptr<typename InstanceFlavor::VerificationKey>& vk)
{
    using PI = ProverInstance_<InstanceFlavor>;
    BB_ASSERT(vk != nullptr, "Chonk::accumulate_and_fold - VK expected for the provided circuit");

    auto prover_instance = std::make_shared<PI>(circuit);
#ifndef NDEBUG
    debug_incoming_circuit<InstanceFlavor>(circuit, prover_instance, vk);
#endif
    // The circuit has been copied into the prover polynomials; free its construction data.
    circuit.free_construction_data();

    // Run sumcheck on the incoming instance; the folding prover caches the resulting claim. The claims of the whole
    // group are batched together once, when the group's last circuit is accumulated (see prove_multilinear_batching).
    vinfo("Accumulating circuit number ", num_circuits_accumulated + 1);
    return folding_prover->template accumulate_instance<InstanceFlavor>(prover_instance, vk);
}

template <IsChonkCircuit Circuit> void Chonk::accumulate_and_fold(Circuit& circuit, const CircuitVerificationKey& vk)
{
    BB_BENCH_NAME("Chonk::accumulate_and_fold");

    // The circuit's arithmetization fixes its kind; accumulate() has already checked it against current_kind().
    constexpr CircuitKind kind = kind_of_circuit<Circuit>;
    static_assert(kind == CircuitKind::App || kind == CircuitKind::Kernel,
                  "the hiding kernel is not folded; see accumulate_hiding_kernel");
    using InstanceFlavor = flavor_for<kind>;
    const CircuitKind following_kind = next_kind();

    const bool state_says_kernel = verification_queue.empty() && num_circuits_accumulated > 0;
    BB_ASSERT_EQ(state_says_kernel,
                 kind == CircuitKind::Kernel,
                 "Chonk::accumulate_and_fold: CircuitKind disagrees with the IVC state machine");

    const bool is_init_group = num_circuits_accumulated == 0;
    if (kind == CircuitKind::Kernel || is_init_group) {
        BB_ASSERT_EQ(folding_prover, nullptr, "Folding prover must be null at the beginning of a group");

        // A kernel/init group begins a new folding group with a fresh transcript and folding prover. The previous
        // accumulator (from the previous group) is supplied at finalize time (see prove_multilinear_batching).
        prover_accumulation_transcript = std::make_shared<Transcript>();
        folding_prover = std::make_shared<FoldingProver>(prover_accumulation_transcript);
#ifndef NDEBUG
        BB_ASSERT_EQ(native_folding_verifier, nullptr, "Folding verifier must be null at the beginning of a group");
        native_verifier_accumulation_transcript = std::make_shared<Transcript>();
        native_folding_verifier =
            std::make_shared<HypernovaFoldingNativeVerifier>(native_verifier_accumulation_transcript);
#endif
    }

    VerifierInputs queue_entry;
    queue_entry.kind = kind;
    auto circuit_vk = std::get<std::shared_ptr<typename InstanceFlavor::VerificationKey>>(vk);
    queue_entry.proof = instance_to_accumulator<InstanceFlavor>(circuit, circuit_vk);
    if constexpr (kind == CircuitKind::Kernel) {
        queue_entry.kernel_honk_vk = std::move(circuit_vk);
    } else {
        queue_entry.app_honk_vk = std::move(circuit_vk);
    }

    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_accumulate");
        detail::GLOBAL_MEMORY_PROFILE.next_circuit();
    }

    verification_queue.push_back(queue_entry);

#ifndef NDEBUG
    verify_native_instance_sumcheck(queue_entry);
#endif

    // If a kernel follows, the circuit just folded was the last of that kernel's group: produce the batching
    // proof the kernel will recursively verify.
    if (following_kind == CircuitKind::Kernel || following_kind == CircuitKind::HidingKernel) {
        prove_multilinear_batching();
    }

    // Merge the ecc ops from this round of accumulation
    goblin.op_queue->merge();

    num_circuits_accumulated++;
}

Chonk::CircuitKind Chonk::current_kind() const
{
    BB_ASSERT_LT(num_circuits_accumulated, num_circuits, "Chonk: every circuit has already been accumulated.");
    return circuit_kinds[num_circuits_accumulated];
}

Chonk::CircuitKind Chonk::next_kind() const
{
    const size_t next_idx = num_circuits_accumulated + 1;
    return next_idx < num_circuits ? circuit_kinds[next_idx] : CircuitKind::None;
}

/**
 * @brief Unified accumulation entry point. Dispatches on `current_kind()` to either folding (App / Kernel)
 * or the hiding-kernel path (HidingKernel — proving deferred to `prove()`). When the next circuit is a
 * kernel, the circuit being accumulated completes that kernel's group, so its multilinear batching proof
 * (and, before the hiding kernel, the decider proof) is produced here.
 */
template <IsChonkCircuit Circuit> void Chonk::accumulate(Circuit& circuit, const CircuitVerificationKey& vk)
{
    BB_BENCH_NAME("Chonk::accumulate");
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "Chonk: Attempting to accumulate more circuits than expected.");
    constexpr CircuitKind kind = kind_of_circuit<Circuit>;
    // Throw, not BB_ASSERT: the kinds arrive from msgpack, so a caller may hand us a circuit built for a
    // different position in the stack than the one the IVC expects next.
    if (kind != current_kind()) {
        throw_or_abort("Chonk::accumulate: circuit arithmetization disagrees with the expected CircuitKind");
    }

    if constexpr (kind == CircuitKind::HidingKernel) {
        // The constructor guarantees the HidingKernel kind only at the final position; std::get below throws
        // bad_variant_access if the caller supplies a non-MegaZK VK.
        accumulate_hiding_kernel(circuit, std::get<std::shared_ptr<MegaZKVerificationKey>>(vk));
    } else {
        // Capture before folding: accumulate_and_fold advances num_circuits_accumulated.
        const CircuitKind following_kind = next_kind();

        accumulate_and_fold(circuit, vk);

        // If the hiding kernel follows, the IVC is complete: prove the batch merge and run the decider on the
        // final accumulator (the output of the hiding kernel's batching). Both proofs are recursively verified
        // in the hiding kernel.
        if (following_kind == CircuitKind::HidingKernel) {
            DeciderProver decider(prover_accumulation_transcript);
            decider_proof = decider.construct_proof(prover_accumulator);
#ifndef NDEBUG
            verify_decider_natively();
#endif
            // The decider proof is the last use of the final accumulator's polynomials.
            prover_accumulator.non_shifted_polynomial = ProverAccumulator::Polynomial{};
            prover_accumulator.shifted_polynomial = ProverAccumulator::Polynomial{};
            goblin.prove_batch_merge();
        }
    }
}

template void Chonk::accumulate<AppCircuit>(AppCircuit&, const CircuitVerificationKey&);
template void Chonk::accumulate<KernelCircuit>(KernelCircuit&, const CircuitVerificationKey&);
template void Chonk::accumulate<HidingKernelCircuit>(HidingKernelCircuit&, const CircuitVerificationKey&);

/**
 * @brief Batch the group's sumcheck claims (collected during the group's accumulate() calls) together with the
 * previous accumulator, using the batching circuit of exactly matching width.
 * @details Called at the end of accumulating the last circuit of a group, i.e. when the next circuit is a kernel.
 * The resulting proof is recursively verified in that kernel's complete_kernel_circuit_logic.
 */
void Chonk::prove_multilinear_batching()
{
    BB_ASSERT(!verification_queue.empty(), "Chonk: cannot batch an empty group");

    // The init kernel's group begins with the first app's proof and carries no accumulator; every later
    // group begins with the previous kernel's proof. So the group is the init group iff its first
    // entry is an app.
    const bool is_init_group = verification_queue.front().kind == CircuitKind::App;
    const size_t num_claims = group_claim_count(/*has_previous_accumulator=*/!is_init_group, verification_queue.size());
    BB_ASSERT_LTE(num_claims, CHONK_MAX_CLAIMS_PER_KERNEL, "Per-kernel batch width exceeds the supported maximum");

    // Fold the group: the previous accumulator (absent for the init group, otherwise from the previous group) followed
    // by the cached per-instance claims, all batched on the group's accumulation transcript so the batching challenge
    // is bound by the instance sumchecks already absorbed there. A single-claim group needs no batching (empty proof).
    std::optional<ProverAccumulator> previous_accumulator =
        is_init_group ? std::nullopt : std::optional<ProverAccumulator>(std::move(prover_accumulator));
    auto [proof, accumulator] = folding_prover->finalize(std::move(previous_accumulator));
    BB_ASSERT_EQ(proof.empty(), num_claims == 1, "A single-claim group must produce no batching proof");
    multilinear_batch_proof = std::move(proof);
    prover_accumulator = std::move(accumulator);

#ifndef NDEBUG
    update_native_verifier_accumulator(is_init_group);
#endif

    folding_prover.reset();
}

/**
 * @brief Construct Chonk proof using the batched MegaZK + Translator protocol.
 *
 * @details Orchestrates the batched proving flow on a shared transcript:
 *   1. MegaZK Oink (pre-sumcheck commitments for the hiding kernel)
 *   2. Merge proof (fixed-location append of the final subtable from the hiding kernel)
 *   3. ECCVM proof (produces translation challenges v, x)
 *   4. IPA proof (separate transcript)
 *   5. Translator Oink + Joint sumcheck + Joint PCS
 *
 * The joint sumcheck and PCS batch the MegaZK and translator circuits together,
 * eliminating separate sumcheck/PCS phases and reducing proof size.
 */
ChonkProof Chonk::prove()
{
    BB_BENCH_NAME("Chonk::prove");

    // Share transcript between all provers.
    goblin.transcript = transcript;

    // Phase 1: MegaZK Oink on the shared transcript.
    BatchedHonkTranslatorProver batched_prover(hiding_prover_inst, hiding_vk, transcript);
    auto hiding_oink_proof = batched_prover.prove_mega_zk_oink();

    // Phase 2: Merge proof on the shared transcript (fixed append — hiding kernel's subtable).
    auto merge_proof = goblin.prove_merge(transcript);
    info("Goblin: num ultra ops = ", goblin.op_queue->get_ultra_ops_count());

    // Phase 3: ECCVM proof on the shared transcript.
    vinfo("prove eccvm...");
    goblin.prove_eccvm();
    vinfo("finished eccvm proving.");

    // Phase 4: Build translator proving key from ECCVM-derived challenges. The key copies the circuit into its
    // polynomials, so the circuit builder is released before proving.
    auto translator_key = [&] {
        TranslatorCircuitBuilder translator_builder(
            goblin.translation_batching_challenge_v, goblin.evaluation_challenge_x, goblin.op_queue);
        return std::make_shared<TranslatorProvingKey>(translator_builder);
    }();

    // Phase 5: Translator Oink + Joint Sumcheck + Joint PCS on the shared transcript.
    vinfo("prove translator and joint...");
    auto joint_proof = batched_prover.prove(translator_key);
    vinfo("finished translator and joint proving.");

    // Release the hiding kernel instance now that proving is complete.
    hiding_prover_inst.reset();

    return ChonkProof{ std::move(hiding_oink_proof),
                       std::move(merge_proof),
                       std::move(goblin.goblin_proof.eccvm_proof),
                       std::move(goblin.goblin_proof.ipa_proof),
                       std::move(joint_proof) };
}

std::shared_ptr<MegaZKFlavor::VKAndHash> Chonk::get_hiding_kernel_vk_and_hash() const
{
    BB_ASSERT(hiding_vk != nullptr, "Hiding kernel VK has not been computed yet");
    return std::make_shared<MegaZKFlavor::VKAndHash>(hiding_vk);
}

} // namespace bb
