#pragma once
#include <barretenberg/dsl/acir_format/acir_format.hpp>
#include <barretenberg/goblin/goblin.hpp>

namespace acir_proofs {

/**
 * @brief A class responsible for marshalling construction of keys and prover and verifier instances used to prove
 * satisfiability of circuits written in ACIR.
 *
 */
class HonkAcirComposer {

    using WitnessVector = std::vector<fr, ContainerSlabAllocator<fr>>;

  public:
    HonkAcirComposer() = default;
    using Builder = acir_format::GoblinBuilder;
    using Prover = GoblinUltraProver;
    using Verifier = GoblinUltraVerifier;
    using ProverInstance = bb::Goblin::GoblinUltraProverInstance;
    using ProvingKey = GoblinUltraFlavor::ProvingKey;
    using VerificationKey = GoblinUltraFlavor::VerificationKey;
    using OpQueue = bb::ECCOpQueue;

    /**
     * @brief Create a GUH circuit from an acir constraint system and a witness
     *
     * @param constraint_system ACIR representation of the constraints defining the circuit
     * @param witness The witness values known to ACIR during construction of the constraint system
     */
    void create_circuit(acir_format::AcirFormat& constraint_system, acir_format::WitnessVector& witness);

    /**
     * @brief Generate a GUH proof for the circuit
     *
     * @return std::vector<bb::fr> GUH proof
     */
    std::vector<bb::fr> prove();

    /**
     * @brief Verify a GUH proof for the circuit
     *
     * @param proof
     * @return bool Whether or not the proof was verified
     */
    bool verify(std::vector<bb::fr> const& proof);

  private:
    std::shared_ptr<ProvingKey> proving_key; // Needed to construct a verification key
    Builder builder_;
    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();

    bool verbose_ = true;
    template <typename... Args> inline void vinfo(Args... args)
    {
        if (verbose_) {
            info(args...);
        }
    }
};

} // namespace acir_proofs
