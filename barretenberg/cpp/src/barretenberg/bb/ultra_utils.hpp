#include "barretenberg/bb/file_io.hpp"
#include "barretenberg/bb/get_bytecode.hpp"
#include "barretenberg/bb/log.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "config.hpp"
#include "get_bn254_crs.hpp"
#include "get_bytecode.hpp"
#include "get_grumpkin_crs.hpp"

namespace bb {

std::string getHomeDir()
{
    char* home = std::getenv("HOME");
    return home != nullptr ? std::string(home) : "./";
}

std::string CRS_PATH = getHomeDir() + "/.bb-crs";

const std::filesystem::path current_path = std::filesystem::current_path();
const auto current_dir = current_path.filename().string();

acir_format::WitnessVector get_witness(std::string const& witness_path)
{
    auto witness_data = get_bytecode(witness_path);
    return acir_format::witness_buf_to_witness_data(witness_data);
}

acir_format::AcirFormat get_constraint_system(std::string const& bytecode_path, bool honk_recursion)
{
    auto bytecode = get_bytecode(bytecode_path);
    return acir_format::circuit_buf_to_acir_format(bytecode, honk_recursion);
}

acir_format::WitnessVectorStack get_witness_stack(std::string const& witness_path)
{
    auto witness_data = get_bytecode(witness_path);
    return acir_format::witness_buf_to_witness_stack(witness_data);
}

std::vector<acir_format::AcirFormat> get_constraint_systems(std::string const& bytecode_path, bool honk_recursion)
{
    auto bytecode = get_bytecode(bytecode_path);
    return acir_format::program_buf_to_acir_format(bytecode, honk_recursion);
}

std::string to_json(std::vector<bb::fr>& data)
{
    return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

/**
 * @brief Initialize the global crs_factory for bn254 based on a known dyadic circuit size
 *
 * @param dyadic_circuit_size power-of-2 circuit size
 */
void init_bn254_crs(size_t dyadic_circuit_size)
{
    // Must +1 for Plonk only!
    auto bn254_g1_data = get_bn254_g1_data(CRS_PATH, dyadic_circuit_size + 1);
    auto bn254_g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory(bn254_g1_data, bn254_g2_data);
}

/**
 * @brief Initialize the global crs_factory for grumpkin based on a known dyadic circuit size
 * @details Grumpkin crs is required only for the ECCVM
 *
 * @param dyadic_circuit_size power-of-2 circuit size
 */
void init_grumpkin_crs(size_t eccvm_dyadic_circuit_size)
{
    auto grumpkin_g1_data = get_grumpkin_g1_data(CRS_PATH, eccvm_dyadic_circuit_size + 1);
    srs::init_grumpkin_crs_factory(grumpkin_g1_data);
}

/**
 * @brief Create a Honk a prover from program bytecode and an optional witness
 *
 * @tparam Flavor
 * @param bytecodePath
 * @param witnessPath
 * @return UltraProver_<Flavor>
 */
template <typename Flavor>
UltraProver_<Flavor> compute_valid_prover(const std::string& bytecodePath,
                                          const std::string& witnessPath,
                                          const bool recursive)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;

    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraKeccakFlavor, UltraRollupFlavor>) {
        honk_recursion = true;
    }
    auto constraint_system = get_constraint_system(bytecodePath, honk_recursion);
    acir_format::WitnessVector witness = {};
    if (!witnessPath.empty()) {
        witness = get_witness(witnessPath);
    }

    auto builder = acir_format::create_circuit<Builder>(constraint_system, recursive, 0, witness, honk_recursion);
    auto prover = Prover{ builder };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    return std::move(prover);
}

/**
 * @brief Creates a proof for an ACIR circuit
 *
 * Communication:
 * - stdout: The proof is written to stdout as a byte array
 * - Filesystem: The proof is written to the path specified by outputPath
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param witnessPath Path to the file containing the serialized witness
 * @param outputPath Path to write the proof to
 */
template <IsUltraFlavor Flavor>
void prove_honk(const std::string& bytecodePath,
                const std::string& witnessPath,
                const std::string& outputPath,
                const bool recursive)
{
    using Prover = UltraProver_<Flavor>;

    // Construct Honk proof
    Prover prover = compute_valid_prover<Flavor>(bytecodePath, witnessPath, recursive);
    auto proof = prover.construct_proof();
    if (outputPath == "-") {
        writeRawBytesToStdout(to_buffer</*include_size=*/true>(proof));
        vinfo("proof written to stdout");
    } else {
        write_file(outputPath, to_buffer</*include_size=*/true>(proof));
        vinfo("proof written to: ", outputPath);
    }
}
} // namespace bb