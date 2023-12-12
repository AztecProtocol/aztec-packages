#pragma once
#include <barretenberg/dsl/acir_format/acir_format.hpp>
#include <barretenberg/goblin/goblin.hpp>
#include <barretenberg/proof_system/op_queue/ecc_op_queue.hpp>

namespace acir_proofs {

/**
 * @brief A class responsible for marshalling construction of keys and prover and verifier instances used to prove
 * satisfiability of circuits written in ACIR.
 * @todo WORKTODO: This reflects the design of Plonk. Perhaps we should author new classes to better reflect the
 * structure of the newer code since there's much more of that code now?
 */
class AcirComposer {
  public:
    using Flavor = proof_system::honk::flavor::Ultra;
    // WORKTODO: it would be nice if we could just flip the flavor
    // using Flavor = plonk::flavor::Ultra;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;

    AcirComposer(size_t size_hint = 0, bool verbose = true);

    void create_circuit(acir_format::acir_format& constraint_system);

    std::shared_ptr<ProvingKey> init_proving_key(acir_format::acir_format& constraint_system);

    std::vector<uint8_t> create_proof(acir_format::acir_format& constraint_system,
                                      acir_format::WitnessVector& witness,
                                      bool is_recursive);

    void load_verification_key(proof_system::plonk::verification_key_data&& data);

    std::shared_ptr<VerificationKey> init_verification_key();

    bool verify_proof(std::vector<uint8_t> const& proof, bool is_recursive);

    std::string get_solidity_verifier();
    size_t get_exact_circuit_size() { return exact_circuit_size_; };
    size_t get_total_circuit_size() { return total_circuit_size_; };
    size_t get_circuit_subgroup_size() { return circuit_subgroup_size_; };

    std::vector<barretenberg::fr> serialize_proof_into_fields(std::vector<uint8_t> const& proof,
                                                              size_t num_inner_public_inputs);

    std::vector<barretenberg::fr> serialize_verification_key_into_fields();

    std::shared_ptr<proof_system::ECCOpQueue> get_goblin_op_queue() { return goblin.op_queue; };

  private:
    acir_format::Builder builder_;
    Goblin goblin;
    size_t size_hint_;
    size_t exact_circuit_size_;
    size_t total_circuit_size_;
    size_t circuit_subgroup_size_;
    std::shared_ptr<acir_format::Composer::ProverInstance> prover_instance_; // WORKTODO: keys needed?
    // std::shared_ptr<acir_format::Composer::VerifierInstance> verifier_instance_; // WORKTODO: keys needed?
    std::shared_ptr<ProvingKey> proving_key_;
    std::shared_ptr<VerificationKey> verification_key_;

    bool verbose_ = true;

    template <typename... Args> inline void vinfo(Args... args)
    {
        if (verbose_) {
            info(args...);
        }
    }
};

} // namespace acir_proofs
