/**
 * @file avm_api_impl.cpp
 * @brief Real AVM implementation forwarding to existing logic
 */
#include "avm_api_impl.hpp"

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/dsl/avm2_recursion_constraint.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb {

// Declare external references to the global CRS factories defined in global_crs.cpp
// These exist in this library's copy of libsrs.a, but we'll override them with main executable's values
namespace srs {
extern std::shared_ptr<factories::CrsFactory<curve::BN254>> bn254_crs_factory;
extern std::shared_ptr<factories::CrsFactory<curve::Grumpkin>> grumpkin_crs_factory;
} // namespace srs

AvmApiImpl::AvmApiImpl()
{
    // CRS initialization is deferred to update_crs() which is called after bb initializes its CRS.
}

void AvmApiImpl::update_crs(void* bn254_crs_factory_ptr, void* grumpkin_crs_factory_ptr)
{
    // Update libvm2.so's CRS factories from bb's initialized globals
    if (bn254_crs_factory_ptr) {
        auto* factory_ptr =
            static_cast<std::shared_ptr<srs::factories::CrsFactory<curve::BN254>>*>(bn254_crs_factory_ptr);
        if (factory_ptr && *factory_ptr) {
            srs::bn254_crs_factory = *factory_ptr;
        }
    }
    if (grumpkin_crs_factory_ptr) {
        auto* factory_ptr =
            static_cast<std::shared_ptr<srs::factories::CrsFactory<curve::Grumpkin>>*>(grumpkin_crs_factory_ptr);
        if (factory_ptr && *factory_ptr) {
            srs::grumpkin_crs_factory = *factory_ptr;
        }
    }
}

namespace {
void print_avm_stats()
{
#ifdef AVM_TRACK_STATS
    info("------- STATS -------");
    const auto& stats = ::bb::avm2::Stats::get();
    const int levels = std::getenv("AVM_STATS_DEPTH") != nullptr ? std::stoi(std::getenv("AVM_STATS_DEPTH")) : 2;
    info(stats.to_string(levels));
#endif
}
} // namespace

void AvmApiImpl::prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path)
{
    avm2::AvmAPI avm;
    auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));
    auto [proof, vk] = avm.prove(inputs);

    // NOTE: As opposed to Avm1 and other proof systems, the public inputs are NOT part of the proof.
    write_file(output_path / "proof", to_buffer(proof));
    write_file(output_path / "vk", vk);

    print_avm_stats();

    // NOTE: Temporarily we also verify after proving.
    // The reasoning is that proving will always pass unless it crashes.
    // We want to return an exit code != 0 if the proof is invalid so that the prover client saves the inputs.
    info("verifying...");
    bool res = avm.verify(proof, inputs.publicInputs, vk);
    info("verification: ", res ? "success" : "failure");
    if (!res) {
        throw std::runtime_error("Generated proof is invalid!!!!!");
    }
}

void AvmApiImpl::check_circuit(const std::filesystem::path& inputs_path)
{
    avm2::AvmAPI avm;
    auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));

    bool res = avm.check_circuit(inputs);
    info("circuit check: ", res ? "success" : "failure");

    print_avm_stats();
}

bool AvmApiImpl::verify(const std::filesystem::path& proof_path,
                        const std::filesystem::path& public_inputs_path,
                        const std::filesystem::path& vk_path)
{
    const auto proof = many_from_buffer<fr>(read_file(proof_path));
    std::vector<uint8_t> vk_bytes = read_file(vk_path);
    auto public_inputs = avm2::PublicInputs::from(read_file(public_inputs_path));

    avm2::AvmAPI avm;
    bool res = avm.verify(proof, public_inputs, vk_bytes);
    info("verification: ", res ? "success" : "failure");

    print_avm_stats();
    return res;
}

void AvmApiImpl::simulate(const std::filesystem::path& inputs_path)
{
    // This includes input deserialization as well.
    AVM_TRACK_TIME("command/avm_simulate", {
        avm2::AvmAPI avm;
        auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));
        avm.simulate(inputs.hints);
    });

    print_avm_stats();
}

acir_format::HonkRecursionConstraintOutput<acir_format::Builder> AvmApiImpl::create_recursion_constraints(
    acir_format::Builder& builder, const acir_format::RecursionConstraint& input, bool has_valid_witness_assignments)
{
    // Forward to the actual implementation in avm2_recursion_constraint.cpp
    return acir_format::create_avm2_recursion_constraints_goblin(builder, input, has_valid_witness_assignments);
}

} // namespace bb

// C interface for dynamic loading
extern "C" {
bb::IAvmApi* create_avm_api()
{
    return new bb::AvmApiImpl();
}
}
