// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/gate_counter.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint_output.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "recursion_constraint.hpp"
#include <cstdint>
#include <vector>

namespace acir_format {

using namespace bb;
using namespace stdlib;

// Used to specify the type of recursive verifier via the proof_type specified by the RecursiveAggregation opcode from
// ACIR
// Keep this enum values in sync with their noir counterpart constants defined in
// noir-projects/noir-protocol-circuits/crates/types/src/constants.nr
enum PROOF_TYPE : uint8_t { HONK, OINK, HN, AVM, ROLLUP_HONK, ROOT_ROLLUP_HONK, HONK_ZK, HN_FINAL, HN_TAIL, CHONK };

// Check if a PROOF_TYPE is a HyperNova variant (OINK, HN, HN_TAIL, HN_FINAL)
constexpr bool is_hypernova_proof_type(uint32_t proof_type)
{
    return proof_type == PROOF_TYPE::OINK || proof_type == PROOF_TYPE::HN || proof_type == PROOF_TYPE::HN_TAIL ||
           proof_type == PROOF_TYPE::HN_FINAL;
}

// Convert ACIR PROOF_TYPE to Chonk::QUEUE_TYPE. Throws for non-HyperNova types.
// Note: QUEUE_TYPE::MEGA is internal to Chonk and has no ACIR equivalent.
inline Chonk::QUEUE_TYPE proof_type_to_chonk_queue_type(uint32_t proof_type)
{
    switch (proof_type) {
    case PROOF_TYPE::OINK:
        return Chonk::QUEUE_TYPE::OINK;
    case PROOF_TYPE::HN:
        return Chonk::QUEUE_TYPE::HN;
    case PROOF_TYPE::HN_TAIL:
        return Chonk::QUEUE_TYPE::HN_TAIL;
    case PROOF_TYPE::HN_FINAL:
        return Chonk::QUEUE_TYPE::HN_FINAL;
    default:
        throw_or_abort("proof_type_to_chonk_queue_type: invalid type " + std::to_string(proof_type));
    }
}

// Inverse of proof_type_to_chonk_queue_type. Throws for MEGA (no ACIR equivalent).
inline PROOF_TYPE queue_type_to_proof_type(Chonk::QUEUE_TYPE queue_type)
{
    switch (queue_type) {
    case Chonk::QUEUE_TYPE::OINK:
        return PROOF_TYPE::OINK;
    case Chonk::QUEUE_TYPE::HN:
        return PROOF_TYPE::HN;
    case Chonk::QUEUE_TYPE::HN_TAIL:
        return PROOF_TYPE::HN_TAIL;
    case Chonk::QUEUE_TYPE::HN_FINAL:
        return PROOF_TYPE::HN_FINAL;
    case Chonk::QUEUE_TYPE::MEGA:
        throw_or_abort("queue_type_to_proof_type: MEGA has no ACIR equivalent");
    }
    throw_or_abort("queue_type_to_proof_type: unknown type");
}

// Static assertions to catch PROOF_TYPE/QUEUE_TYPE enum desync at compile time
namespace detail {
// PROOF_TYPE values must match Noir constants
static_assert(PROOF_TYPE::OINK == 1);
static_assert(PROOF_TYPE::HN == 2);
static_assert(PROOF_TYPE::HN_FINAL == 7);
static_assert(PROOF_TYPE::HN_TAIL == 8);

// QUEUE_TYPE ordering (internal, but catch unexpected changes)
static_assert(static_cast<uint8_t>(Chonk::QUEUE_TYPE::OINK) == 0);
static_assert(static_cast<uint8_t>(Chonk::QUEUE_TYPE::HN) == 1);
static_assert(static_cast<uint8_t>(Chonk::QUEUE_TYPE::HN_TAIL) == 2);
static_assert(static_cast<uint8_t>(Chonk::QUEUE_TYPE::HN_FINAL) == 3);
static_assert(static_cast<uint8_t>(Chonk::QUEUE_TYPE::MEGA) == 4);
} // namespace detail

/**
 * @brief RecursionConstraint struct contains information required to recursively verify a proof
 *
 * @details The recursive verifier algorithm produces an aggregation object representing 2 G1 points, which in the code
 * is called PairingPoints. The smart contract Verifier must be aware of this aggregation object in order to complete
 * the recursive verification. We output the PairingPoints object to avoid perfoming pairing calculations in-circuit.
 *
 * NOTE: Each recursive verification outputs a different PairingPoints object. If a circuit performs multiple recursive
 * verifications we aggregate the PairingPoints into a single PairingPoints using random challenges.
 *
 * NOTE: If a circuit `C` recursively verifies a proof \f$\pi\f$ which is the output of another recursive verification,
 * then \f$\pi\f$ contains among its public inputs a PairingPoints object \f$P\f$. Then, `C` extracts \f$P\f$ from the
 * public inputs, recursively verifies the proof \f$\pi\f$ producing a PairingPoints objects \f$P'\f$, and then
 * aggregates \f$P, P'\f$ to produce a new PairingPoints object \f$P_{out}\f$ which is added to the public inputs of
 * `C`.
 *
 * @param key the indices of the verification key of the circuit whose proof is recursively verified
 * @param proof the indices of the proof being recursively verified
 * @param public_inputs the indices of the public inputs of the proof being recursively verified
 * @param key_hash the index of the hash of the verification key of the circuit whose proof is being recursively
 * verified
 * @param proof_type the type of the proof being recursively verified
 * @param predicate witness or constant determining whether the recursive verification constraint is active
 *
 */
struct RecursionConstraint {
    std::vector<uint32_t> key;
    std::vector<uint32_t> proof;
    std::vector<uint32_t> public_inputs;
    uint32_t key_hash;
    uint32_t proof_type;
    WitnessOrConstant<bb::fr> predicate;

    friend bool operator==(RecursionConstraint const& lhs, RecursionConstraint const& rhs) = default;
};

/**
 * @brief Single entrypoint to process recursion constraints
 *
 * @details This functions processes the recursion constraints that have to be added to the builder. It has two
 * specializations:
 *   - MegaCircuitBuilder: only Honk and HyperNova recursion constraints are processed. AVM and Chonk are not handled
 *     and a WARNING is output in case they are encountered. We fail if both Honk and HyperNova recursion constraints
 *     are present.
 *   - UltraCircuitBuilder: Honk, AVM and Chonk recursion constraints are processed. HyperNova recursion constraints are
 *     not handled and we fail if we encounter them. We handle:
 *       - Chonk recursion constraints (Private Base Rollup)
 *       - Honk + AVM recursion constraints (Public Base Rollup)
 *       - Honk recursion constraints
 *       - AVM recursion constraints
 *     However, as mock protocol circuits use Chonk + AVM (mock Public Base Rollup), instead of throwing an assert we
 *     return a vinfo for the case of Chonk + AVM
 *
 * @tparam Builder
 * @param builder
 * @param gate_counter
 * @param gates_per_opcode
 * @param ivc_base
 * @param honk_recursion_data pair of (HonkRecursionConstraints, HonkRecursionConstraintsOriginalOpcodeIndices)
 * @param avm_recursion_data pair of (AvmRecursionConstraints, AvmRecursionConstraintsOriginalOpcodeIndices)
 * @param hn_recursion_data pair of (HypernovaRecursionConstraints, HypernovaRecursionConstraintsOriginalOpcodeIndices)
 * @param chonk_recursion_data pair of (ChonkRecursionConstraints, ChonkRecursionConstraintsOriginalOpcodeIndices)
 */
template <typename Builder>
HonkRecursionConstraintsOutput<Builder> create_recursion_constraints(
    Builder& builder,
    GateCounter<Builder>& gate_counter,
    std::vector<size_t>& gates_per_opcode,
    [[maybe_unused]] const std::shared_ptr<Chonk>& ivc_base,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& honk_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& avm_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& hn_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& chonk_recursion_data);

/**
 * @brief Process HyperNova recursion constraints and complete kernel logic
 *
 * @param builder
 * @param gate_counter
 * @param gates_per_opcode
 * @param hn_recursion_data pair of (HypernovaRecursionConstraints, HypernovaRecursionConstraintsOriginalOpcodeIndices)
 * @param ivc_base
 */
void process_hn_recursion_constraints(
    MegaCircuitBuilder& builder,
    GateCounter<MegaCircuitBuilder>& gate_counter,
    std::vector<size_t>& gates_per_opcode,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& hn_recursion_data,
    const std::shared_ptr<Chonk>& ivc_base);

} // namespace acir_format
