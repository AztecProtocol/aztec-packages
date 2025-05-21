// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/serialize.hpp"
#include <cstdint>
#include <vector>

namespace acir_format {

// Used to specify the type of recursive verifier via the proof_type specified by the RecursiveAggregation opcode from
// ACIR
// Keep this enum values in sync with their noir counterpart constants defined in
// noir-protocol-circuits/crates/types/src/constants.nr
enum PROOF_TYPE { PLONK, HONK, OINK, PG, AVM, ROLLUP_HONK, ROOT_ROLLUP_HONK };

/**
 * @brief RecursionConstraint struct contains information required to recursively verify a proof!
 *
 * @details The recursive verifier algorithm produces an 'aggregation object' representing 2 G1 points, expressed as 16
 * witness values. The smart contract Verifier must be aware of this aggregation object in order to complete the full
 * recursive verification. If the circuit verifies more than 1 proof, the recursion algorithm will update a pre-existing
 * aggregation object (`input_points_accumulator`).
 *
 * @details We currently require that the inner circuit being verified only has a single public input. If more are
 * required, the outer circuit can hash them down to 1 input.
 *
 * @param verification_key_data The inner circuit vkey. Is converted into circuit witness values (internal to the
 * backend)
 * @param proof The plonk proof. Is converted into circuit witness values (internal to the backend)
 * @param is_points_accumulator_nonzero A flag to tell us whether the circuit has already recursively verified proofs
 * (and therefore an aggregation object is present)
 * @param public_input The index of the single public input
 * @param input_points_accumulator Witness indices of pre-existing aggregation object (if it exists)
 * @param output_points_accumulator Witness indices of the aggregation object produced by recursive verification
 * @param nested_points_accumulator Public input indices of an aggregation object inside the proof.
 *
 * @note If input_points_accumulator witness indices are all zero, we interpret this to mean that the inner proof does
 * NOT contain a previously recursively verified proof
 * @note nested_points_accumulator is used for cases where the proof being verified contains an aggregation object in
 * its public inputs! If this is the case, we record the public input locations in `nested_points_accumulator`. If the
 * inner proof is of a circuit that does not have a nested aggregation object, these values are all zero.
 *
 * To outline the interaction between the input_aggergation_object and the nested_points_accumulator take the following
 * example: If we have a circuit that verifies 2 proofs A and B, the recursion constraint for B will have an
 * input_points_accumulator that points to the aggregation output produced by verifying A. If circuit B also verifies a
 * proof, in the above example the recursion constraint for verifying B will have a nested object that describes the
 * aggregation object in B’s public inputs as well as an input aggregation object that points to the object produced by
 * the previous recursion constraint in the circuit (the one that verifies A)
 *
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/996): Create similar comments for Honk.
 */
struct RecursionConstraint {
    // An aggregation state is represented by two G1 affine elements. Each G1 point has
    // two field element coordinates (x, y). Thus, four field elements
    static constexpr size_t NUM_AGGREGATION_ELEMENTS = 4;
    std::vector<uint32_t> key;
    std::vector<uint32_t> proof;
    std::vector<uint32_t> public_inputs;
    uint32_t key_hash;
    uint32_t proof_type;

    friend bool operator==(RecursionConstraint const& lhs, RecursionConstraint const& rhs) = default;
};

template <typename B> inline void read(B& buf, RecursionConstraint& constraint)
{
    using serialize::read;
    read(buf, constraint.key);
    read(buf, constraint.proof);
    read(buf, constraint.public_inputs);
    read(buf, constraint.key_hash);
}

template <typename B> inline void write(B& buf, RecursionConstraint const& constraint)
{
    using serialize::write;
    write(buf, constraint.key);
    write(buf, constraint.proof);
    write(buf, constraint.public_inputs);
    write(buf, constraint.key_hash);
}

} // namespace acir_format
