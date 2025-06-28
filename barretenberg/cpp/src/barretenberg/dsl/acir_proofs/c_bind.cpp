// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "c_bind.hpp"
#include "../acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/private_execution_steps.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/net.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"

#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "honk_contract.hpp"
#include <cstdint>
#include <memory>

WASM_EXPORT void acir_get_circuit_sizes(
    uint8_t const* acir_vec, bool const* recursive, bool const* honk_recursion, uint32_t* total, uint32_t* subgroup)
{
    const acir_format::ProgramMetadata metadata{ .recursive = *recursive,
                                                 .honk_recursion = *honk_recursion,
                                                 .size_hint = 1 << 19 };
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(
        from_buffer<std::vector<uint8_t>>(acir_vec)) };
    auto builder = acir_format::create_circuit(program, metadata);
    builder.finalize_circuit(/*ensure_nonzero=*/true);
    *total = htonl((uint32_t)builder.get_finalized_total_circuit_size());
    *subgroup = htonl((uint32_t)builder.get_circuit_subgroup_size(builder.get_finalized_total_circuit_size()));
}

WASM_EXPORT void acir_prove_and_verify_ultra_honk(uint8_t const* acir_vec, uint8_t const* witness_vec, bool* result)
{
    const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
    acir_format::AcirProgram program{
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec)),
        acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec))
    };

    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);

    auto proving_key = std::make_shared<DeciderProvingKey_<UltraFlavor>>(builder);
    auto verification_key =
        std::make_shared<UltraFlavor::VerificationKey>(proving_key->polynomials, proving_key->metadata);
    UltraProver prover{ proving_key, verification_key };
    auto proof = prover.construct_proof();

    UltraVerifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
    info("verified: ", *result);
}

WASM_EXPORT void acir_prove_and_verify_mega_honk(uint8_t const* acir_vec, uint8_t const* witness_vec, bool* result)
{
    const acir_format::ProgramMetadata metadata{ .honk_recursion = 0 };

    acir_format::AcirProgram program{
        acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec)),
        acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec))
    };

    auto builder = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);

    auto proving_key = std::make_shared<DeciderProvingKey_<MegaFlavor>>(builder);
    auto verification_key =
        std::make_shared<MegaFlavor::VerificationKey>(proving_key->polynomials, proving_key->metadata);
    MegaProver prover{ proving_key, verification_key };
    auto proof = prover.construct_proof();

    MegaVerifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
}

WASM_EXPORT void acir_prove_aztec_client(uint8_t const* ivc_inputs_buf, uint8_t** out_proof, uint8_t** out_vk)
{
    auto ivc_inputs_vec = from_buffer<std::vector<uint8_t>>(ivc_inputs_buf);
    // Accumulate the entire program stack into the IVC
    auto start = std::chrono::steady_clock::now();
    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::parse_uncompressed(ivc_inputs_vec));
    std::shared_ptr<ClientIVC> ivc = steps.accumulate();
    auto end = std::chrono::steady_clock::now();
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to construct and accumulate all circuits: ", diff.count());

    vinfo("calling ivc.prove ...");
    ClientIVC::Proof proof = ivc->prove();
    end = std::chrono::steady_clock::now();

    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to construct, accumulate, prove all circuits: ", diff.count());

    start = std::chrono::steady_clock::now();
    *out_proof = proof.to_msgpack_heap_buffer();
    end = std::chrono::steady_clock::now();
    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to serialize proof: ", diff.count());

    start = std::chrono::steady_clock::now();
    *out_vk = to_heap_buffer(to_buffer(ivc->get_vk()));
    end = std::chrono::steady_clock::now();
    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to serialize vk: ", diff.count());
}

WASM_EXPORT void acir_verify_aztec_client(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result)
{
    const auto proof = ClientIVC::Proof::from_msgpack_buffer(proof_buf);
    const auto vk = from_buffer<ClientIVC::VerificationKey>(from_buffer<std::vector<uint8_t>>(vk_buf));

    *result = ClientIVC::verify(proof, vk);
}

WASM_EXPORT void acir_prove_ultra_honk(uint8_t const* acir_vec,
                                       uint8_t const* witness_vec,
                                       uint8_t const* vk_buf,
                                       uint8_t** out)
{
    // Lambda function to ensure things get freed before proving.
    UltraProver prover = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{
            acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec)),
            acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec))
        };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
        auto proving_key = std::make_shared<DeciderProvingKey_<UltraFlavor>>(builder);
        auto verification_key =
            std::make_shared<UltraFlavor::VerificationKey>(from_buffer<UltraFlavor::VerificationKey>(vk_buf));

        return UltraProver(proving_key, verification_key);
    }();

    auto proof = prover.construct_proof();
    *out = to_heap_buffer(to_buffer(proof));
}

WASM_EXPORT void acir_prove_ultra_keccak_honk(uint8_t const* acir_vec,
                                              uint8_t const* witness_vec,
                                              uint8_t const* vk_buf,
                                              uint8_t** out)
{
    // Lambda function to ensure things get freed before proving.
    UltraKeccakProver prover = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{
            acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec)),
            acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec))
        };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);

        auto proving_key = std::make_shared<DeciderProvingKey_<UltraKeccakFlavor>>(builder);
        auto verification_key = std::make_shared<UltraKeccakFlavor::VerificationKey>(
            from_buffer<UltraKeccakFlavor::VerificationKey>(vk_buf));
        return UltraKeccakProver(proving_key, verification_key);
    }();
    auto proof = prover.construct_proof();
    *out = to_heap_buffer(to_buffer(proof));
}

WASM_EXPORT void acir_prove_ultra_keccak_zk_honk(uint8_t const* acir_vec,
                                                 uint8_t const* witness_vec,
                                                 uint8_t const* vk_buf,
                                                 uint8_t** out)
{
    // Lambda function to ensure things get freed before proving.
    UltraKeccakZKProver prover = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{
            acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec)),
            acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec))
        };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);

        auto proving_key = std::make_shared<DeciderProvingKey_<UltraKeccakZKFlavor>>(builder);
        auto verification_key = std::make_shared<UltraKeccakZKFlavor::VerificationKey>(
            from_buffer<UltraKeccakZKFlavor::VerificationKey>(vk_buf));
        return UltraKeccakZKProver(proving_key, verification_key);
    }();
    auto proof = prover.construct_proof();
    *out = to_heap_buffer(to_buffer(proof));
}

WASM_EXPORT void acir_prove_ultra_starknet_honk([[maybe_unused]] uint8_t const* acir_vec,
                                                [[maybe_unused]] uint8_t const* witness_vec,
                                                [[maybe_unused]] uint8_t const* vk_buf,
                                                [[maybe_unused]] uint8_t** out)
{
#ifdef STARKNET_GARAGA_FLAVORS
    // Lambda function to ensure things get freed before proving.
    UltraStarknetProver prover = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{
            acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec)),
            acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec))
        };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);

        return UltraStarknetProver(builder);
    }();
    auto proof = prover.construct_proof();
    *out = to_heap_buffer(to_buffer(proof));
#else
    throw_or_abort("bb wasm was not compiled with starknet garaga flavors!");
#endif
}

WASM_EXPORT void acir_prove_ultra_starknet_zk_honk([[maybe_unused]] uint8_t const* acir_vec,
                                                   [[maybe_unused]] uint8_t const* witness_vec,
                                                   [[maybe_unused]] uint8_t const* vk_buf,
                                                   [[maybe_unused]] uint8_t** out)
{
#ifdef STARKNET_GARAGA_FLAVORS
    // Lambda function to ensure things get freed before proving.
    UltraStarknetZKProver prover = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{
            acir_format::circuit_buf_to_acir_format(from_buffer<std::vector<uint8_t>>(acir_vec)),
            acir_format::witness_buf_to_witness_data(from_buffer<std::vector<uint8_t>>(witness_vec))
        };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);

        return UltraStarknetZKProver(builder);
    }();
    auto proof = prover.construct_proof();
    *out = to_heap_buffer(to_buffer(proof));
#else
    throw_or_abort("bb wasm was not compiled with starknet garaga flavors!");
#endif
}

WASM_EXPORT void acir_verify_ultra_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result)
{
    using VerificationKey = UltraFlavor::VerificationKey;
    using Verifier = UltraVerifier_<UltraFlavor>;

    auto proof = many_from_buffer<bb::fr>(from_buffer<std::vector<uint8_t>>(proof_buf));
    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));

    Verifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
}

WASM_EXPORT void acir_verify_ultra_keccak_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result)
{
    using VerificationKey = UltraKeccakFlavor::VerificationKey;
    using Verifier = UltraVerifier_<UltraKeccakFlavor>;

    auto proof = many_from_buffer<bb::fr>(from_buffer<std::vector<uint8_t>>(proof_buf));
    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));

    Verifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
}

WASM_EXPORT void acir_verify_ultra_keccak_zk_honk(uint8_t const* proof_buf, uint8_t const* vk_buf, bool* result)
{
    using VerificationKey = UltraKeccakZKFlavor::VerificationKey;
    using Verifier = UltraVerifier_<UltraKeccakZKFlavor>;

    auto proof = many_from_buffer<bb::fr>(from_buffer<std::vector<uint8_t>>(proof_buf));
    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));

    Verifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
}

WASM_EXPORT void acir_verify_ultra_starknet_honk([[maybe_unused]] uint8_t const* proof_buf,
                                                 [[maybe_unused]] uint8_t const* vk_buf,
                                                 [[maybe_unused]] bool* result)
{
#ifdef STARKNET_GARAGA_FLAVORS
    using VerificationKey = UltraStarknetFlavor::VerificationKey;
    using Verifier = UltraVerifier_<UltraStarknetFlavor>;

    auto proof = from_buffer<std::vector<bb::fr>>(from_buffer<std::vector<uint8_t>>(proof_buf));
    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));

    Verifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
#else
    throw_or_abort("bb wasm was not compiled with starknet garaga flavors!");
#endif
}

WASM_EXPORT void acir_verify_ultra_starknet_zk_honk([[maybe_unused]] uint8_t const* proof_buf,
                                                    [[maybe_unused]] uint8_t const* vk_buf,
                                                    [[maybe_unused]] bool* result)
{
#ifdef STARKNET_GARAGA_FLAVORS
    using VerificationKey = UltraStarknetZKFlavor::VerificationKey;
    using Verifier = UltraVerifier_<UltraStarknetZKFlavor>;

    auto proof = many_from_buffer<bb::fr>(from_buffer<std::vector<uint8_t>>(proof_buf));
    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));

    Verifier verifier{ verification_key };

    *result = verifier.verify_proof(proof);
#else
    throw_or_abort("bb wasm was not compiled with starknet garaga flavors!");
#endif
}

WASM_EXPORT void acir_write_vk_ultra_honk(uint8_t const* acir_vec, uint8_t** out)
{
    using DeciderProvingKey = DeciderProvingKey_<UltraFlavor>;
    using VerificationKey = UltraFlavor::VerificationKey;
    // lambda to free the builder
    DeciderProvingKey proving_key = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(
            from_buffer<std::vector<uint8_t>>(acir_vec)) };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
        return DeciderProvingKey(builder);
    }();
    VerificationKey vk(proving_key.polynomials, proving_key.metadata);
    vinfo("Constructed UltraHonk verification key");
    *out = to_heap_buffer(to_buffer(vk));
}

WASM_EXPORT void acir_write_vk_ultra_keccak_honk(uint8_t const* acir_vec, uint8_t** out)
{
    using DeciderProvingKey = DeciderProvingKey_<UltraKeccakFlavor>;
    using VerificationKey = UltraKeccakFlavor::VerificationKey;

    // lambda to free the builder
    DeciderProvingKey proving_key = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(
            from_buffer<std::vector<uint8_t>>(acir_vec)) };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
        return DeciderProvingKey(builder);
    }();
    VerificationKey vk(proving_key.polynomials, proving_key.metadata);
    vinfo("Constructed UltraKeccakHonk verification key");
    *out = to_heap_buffer(to_buffer(vk));
}

WASM_EXPORT void acir_write_vk_ultra_keccak_zk_honk(uint8_t const* acir_vec, uint8_t** out)
{
    using DeciderProvingKey = DeciderProvingKey_<UltraKeccakZKFlavor>;
    using VerificationKey = UltraKeccakZKFlavor::VerificationKey;

    // lambda to free the builder
    DeciderProvingKey proving_key = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(
            from_buffer<std::vector<uint8_t>>(acir_vec)) };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
        return DeciderProvingKey(builder);
    }();
    VerificationKey vk(proving_key.polynomials, proving_key.metadata);
    vinfo("Constructed UltraKeccakZKHonk verification key");
    *out = to_heap_buffer(to_buffer(vk));
}

WASM_EXPORT void acir_write_vk_ultra_starknet_honk([[maybe_unused]] uint8_t const* acir_vec,
                                                   [[maybe_unused]] uint8_t** out)
{
#ifdef STARKNET_GARAGA_FLAVORS
    using DeciderProvingKey = DeciderProvingKey_<UltraStarknetFlavor>;
    using VerificationKey = UltraStarknetFlavor::VerificationKey;

    // lambda to free the builder
    DeciderProvingKey proving_key = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(
            from_buffer<std::vector<uint8_t>>(acir_vec)) };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
        return DeciderProvingKey(builder);
    }();
    VerificationKey vk(proving_key.polynomials, proving_key.metadata);
    vinfo("Constructed UltraStarknetHonk verification key");
    *out = to_heap_buffer(to_buffer(vk));
#else
    throw_or_abort("bb wasm was not compiled with starknet garaga flavors!");
#endif
}

WASM_EXPORT void acir_write_vk_ultra_starknet_zk_honk([[maybe_unused]] uint8_t const* acir_vec,
                                                      [[maybe_unused]] uint8_t** out)
{
#ifdef STARKNET_GARAGA_FLAVORS
    using DeciderProvingKey = DeciderProvingKey_<UltraStarknetZKFlavor>;
    using VerificationKey = UltraStarknetZKFlavor::VerificationKey;

    // lambda to free the builder
    DeciderProvingKey proving_key = [&] {
        const acir_format::ProgramMetadata metadata{ .honk_recursion = 1 };
        acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(
            from_buffer<std::vector<uint8_t>>(acir_vec)) };
        auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
        return DeciderProvingKey(builder);
    }();
    VerificationKey vk(proving_key.polynomials, proving_key.metadata);
    vinfo("Constructed UltraStarknetZKHonk verification key");
    *out = to_heap_buffer(to_buffer(vk));
#else
    throw_or_abort("bb wasm was not compiled with starknet garaga flavors!");
#endif
}

WASM_EXPORT void acir_honk_solidity_verifier(uint8_t const* proof_buf, uint8_t const* vk_buf, uint8_t** out)
{
    using VerificationKey = UltraKeccakFlavor::VerificationKey;

    auto proof = many_from_buffer<bb::fr>(from_buffer<std::vector<uint8_t>>(proof_buf));
    auto verification_key = from_buffer<VerificationKey>(vk_buf);

    auto str = get_honk_solidity_verifier(&verification_key);
    *out = to_heap_buffer(str);
}

WASM_EXPORT void acir_proof_as_fields_ultra_honk(uint8_t const* proof_buf, fr::vec_out_buf out)
{
    auto proof = many_from_buffer<bb::fr>(from_buffer<std::vector<uint8_t>>(proof_buf));
    *out = to_heap_buffer(proof);
}

WASM_EXPORT void acir_vk_as_fields_ultra_honk(uint8_t const* vk_buf, fr::vec_out_buf out_vkey)
{
    using VerificationKey = UltraFlavor::VerificationKey;

    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));
    std::vector<bb::fr> vkey_as_fields = verification_key->to_field_elements();
    *out_vkey = to_heap_buffer(vkey_as_fields);
}

WASM_EXPORT void acir_vk_as_fields_mega_honk(uint8_t const* vk_buf, fr::vec_out_buf out_vkey)
{
    using VerificationKey = MegaFlavor::VerificationKey;

    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buf));
    std::vector<bb::fr> vkey_as_fields = verification_key->to_field_elements();
    *out_vkey = to_heap_buffer(vkey_as_fields);
}

WASM_EXPORT void acir_gates_aztec_client(uint8_t const* ivc_inputs_buf, uint8_t** out)
{
    auto ivc_inputs_vec = from_buffer<std::vector<uint8_t>>(ivc_inputs_buf);
    // Note: we parse a stack, but only 'bytecode' needs to be set.
    auto raw_steps = PrivateExecutionStepRaw::parse_uncompressed(ivc_inputs_vec);
    std::vector<uint32_t> totals;

    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(trace_settings);
    const acir_format::ProgramMetadata metadata{ ivc };

    for (const PrivateExecutionStepRaw& step : raw_steps) {
        std::vector<uint8_t> bytecode_vec(step.bytecode.begin(), step.bytecode.end());
        const acir_format::AcirFormat constraint_system =
            acir_format::circuit_buf_to_acir_format(std::move(bytecode_vec));

        // Create an acir program from the constraint system
        acir_format::AcirProgram program{ constraint_system };

        auto builder = acir_format::create_circuit<MegaCircuitBuilder>(program);
        builder.finalize_circuit(/*ensure_nonzero=*/true);
        totals.push_back(static_cast<uint32_t>(builder.num_gates));
    }

    *out = to_heap_buffer(to_buffer(totals));
}
