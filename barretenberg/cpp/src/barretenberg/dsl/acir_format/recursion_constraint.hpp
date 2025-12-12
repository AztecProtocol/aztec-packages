// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_base.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/gate_counter.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint_output.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
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
    [[maybe_unused]] const std::shared_ptr<IVCBase>& ivc_base,
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
    const std::shared_ptr<IVCBase>& ivc_base);

} // namespace acir_format
