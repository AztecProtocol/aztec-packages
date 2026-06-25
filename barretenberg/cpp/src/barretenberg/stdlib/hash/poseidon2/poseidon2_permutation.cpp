// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "poseidon2_permutation.hpp"

#include "barretenberg/honk/execution_trace/gate_data.hpp"
#include "barretenberg/stdlib_circuit_builders/duplicate_provenance.hpp"

namespace bb::stdlib {
namespace {

// BOOMERANG_DUPLICATE_PROVENANCE: See
// barretenberg/cpp/src/barretenberg/boomerang_value_detection/WITNESS_DUPLICATE_DETECTION.md. Poseidon2 provenance is
// keyed by both permutation-input identity and the exact generated state slot. Two permutations over the same input
// witnesses share keys only for corresponding round/state slots; different slots in one permutation have distinct keys.
enum class Poseidon2ProvenanceSlot : uint64_t {
    INITIAL_EXTERNAL = 0,
    STANDARD_INTERNAL = 1,
    COMPRESSED_INTERNAL = 2,
    EXTERNAL = 3,
};

enum class Poseidon2InputIdentityKind : uint64_t { CONSTANT = 0, WITNESS_AFFINE = 1 };

inline void append_poseidon2_field(DuplicateProvenanceLocalId& identities, const bb::fr& value)
{
    const uint256_t value_uint256(value);
    for (const uint64_t limb : value_uint256.data) {
        append_duplicate_provenance_identity(identities, limb);
    }
}

template <typename Builder>
DuplicateProvenanceLocalId poseidon2_witness_identity(Builder* builder, const uint32_t witness_index)
{
    const uint32_t real_index = builder->real_variable_index[witness_index];
    const auto& provenance = builder->get_duplicate_provenance();
    auto provenance_it = provenance.find(real_index);
    if (provenance_it != provenance.end()) {
        return builder->get_duplicate_provenance_interned_identity(provenance_it->second);
    }
    return duplicate_provenance_local_id({ DUPLICATE_PROVENANCE_RAW_IDENTITY_TAG, static_cast<uint64_t>(real_index) });
}

template <typename Builder>
DuplicateProvenanceLocalId permutation_input_local_id(Builder* builder,
                                                      const typename Poseidon2Permutation<Builder>::State& input)
{
    DuplicateProvenanceLocalId identities;
    for (const auto& limb : input) {
        if (limb.is_constant()) {
            append_duplicate_provenance_identity(identities,
                                                 static_cast<uint64_t>(Poseidon2InputIdentityKind::CONSTANT));
            append_poseidon2_field(identities, limb.get_value());
        } else {
            append_duplicate_provenance_identity(identities,
                                                 static_cast<uint64_t>(Poseidon2InputIdentityKind::WITNESS_AFFINE));
            append_duplicate_provenance_identity(identities,
                                                 poseidon2_witness_identity(builder, limb.get_raw_witness_index()));
            append_poseidon2_field(identities, limb.multiplicative_constant);
            append_poseidon2_field(identities, limb.additive_constant);
        }
    }
    return identities;
}

template <typename Builder>
DuplicateProvenance poseidon2_slot_provenance_key(Builder* builder,
                                                  const DuplicateProvenanceLocalId& input_id,
                                                  std::initializer_list<uint64_t> slot)
{
    DuplicateProvenanceLocalId local_id;
    if (const auto& cryptographic_binding_scope = builder->get_duplicate_cryptographic_binding_scope();
        cryptographic_binding_scope.has_value()) {
        append_duplicate_provenance_identity(local_id, cryptographic_binding_scope.value());
        append_duplicate_provenance_identity(local_id, DuplicateProvenanceLocalId(slot));
        return Builder::make_duplicate_provenance(DuplicateProvenanceCategory::POSEIDON2_CRYPTOGRAPHIC_BINDING,
                                                  std::move(local_id));
    }

    append_duplicate_provenance_identity(local_id, input_id);
    append_duplicate_provenance_identity(local_id, DuplicateProvenanceLocalId(slot));
    return Builder::make_duplicate_provenance(DuplicateProvenanceCategory::POSEIDON2_PERMUTATION, std::move(local_id));
}

template <typename Builder>
void materialize_constants_for_initial_layer(Builder* builder, typename Poseidon2Permutation<Builder>::State& state)
{
    // The Mega initial-external custom gate records its four inputs by witness index. A constant field_t has no
    // witness index until it is put into the builder's constant table, while the Ultra six-gate computation below can
    // use constant field_t values directly.
    for (auto& state_limb : state) {
        if (state_limb.is_constant()) {
            state_limb =
                field_t<Builder>::from_witness_index(builder, builder->put_constant_variable(state_limb.get_value()));
        }
    }
}

template <typename Builder>
void sync_native_state_from_state(typename Poseidon2Permutation<Builder>::NativeState& native_state,
                                  const typename Poseidon2Permutation<Builder>::State& state)
{
    for (size_t i = 0; i < Poseidon2Permutation<Builder>::t; ++i) {
        native_state[i] = state[i].get_value();
    }
}

template <typename Builder>
void apply_external_rounds(Builder* builder,
                           typename Poseidon2Permutation<Builder>::State& current_state,
                           typename Poseidon2Permutation<Builder>::NativeState& current_native_state,
                           const size_t begin,
                           const size_t end,
                           const DuplicateProvenanceLocalId& input_id)
{
    using Permutation = Poseidon2Permutation<Builder>;
    using FF = typename Permutation::FF;
    using Witness = witness_t<Builder>;

    for (size_t i = begin; i < end; ++i) {
        poseidon2_external_gate_<FF> in{ current_state[0].get_witness_index(),
                                         current_state[1].get_witness_index(),
                                         current_state[2].get_witness_index(),
                                         current_state[3].get_witness_index(),
                                         i };
        builder->create_poseidon2_external_gate(in);
        Permutation::NativePermutation::add_round_constants(current_native_state, Permutation::round_constants[i]);
        Permutation::NativePermutation::apply_sbox(current_native_state);
        Permutation::NativePermutation::matrix_multiplication_external(current_native_state);
        for (size_t j = 0; j < Permutation::t; ++j) {
            current_state[j] = Witness(builder, current_native_state[j]);
            builder->tag_duplicate_provenance(
                current_state[j].get_witness_index(),
                poseidon2_slot_provenance_key<Builder>(
                    builder, input_id, { static_cast<uint64_t>(Poseidon2ProvenanceSlot::EXTERNAL), i, j }));
        }
    }
}

template <typename Builder>
void apply_standard_internal_rounds(Builder* builder,
                                    typename Poseidon2Permutation<Builder>::State& current_state,
                                    typename Poseidon2Permutation<Builder>::NativeState& current_native_state,
                                    const size_t rounds_f_beginning,
                                    const size_t p_end,
                                    const DuplicateProvenanceLocalId& input_id)
{
    using Permutation = Poseidon2Permutation<Builder>;
    using Witness = witness_t<Builder>;

    for (size_t i = rounds_f_beginning; i < p_end; ++i) {
        poseidon2_internal_gate_<typename Permutation::FF> in{ current_state[0].get_witness_index(),
                                                               current_state[1].get_witness_index(),
                                                               current_state[2].get_witness_index(),
                                                               current_state[3].get_witness_index(),
                                                               i };
        builder->create_poseidon2_internal_gate(in);
        current_native_state[0] += Permutation::round_constants[i][0];
        Permutation::NativePermutation::apply_single_sbox(current_native_state[0]);
        Permutation::NativePermutation::matrix_multiplication_internal(current_native_state);
        for (size_t j = 0; j < Permutation::t; ++j) {
            current_state[j] = Witness(builder, current_native_state[j]);
            builder->tag_duplicate_provenance(
                current_state[j].get_witness_index(),
                poseidon2_slot_provenance_key<Builder>(
                    builder, input_id, { static_cast<uint64_t>(Poseidon2ProvenanceSlot::STANDARD_INTERNAL), i, j }));
        }
    }
    Permutation::propagate_current_state_to_next_row(builder, current_state, builder->blocks.poseidon2_internal);
}

void apply_mega_internal_rounds(MegaCircuitBuilder* builder,
                                typename Poseidon2Permutation<MegaCircuitBuilder>::State& current_state,
                                typename Poseidon2Permutation<MegaCircuitBuilder>::NativeState& current_native_state,
                                const size_t rounds_f_beginning,
                                const DuplicateProvenanceLocalId& input_id)
{
    using Permutation = Poseidon2Permutation<MegaCircuitBuilder>;
    using FF = typename Permutation::FF;
    using NativeState = typename Permutation::NativeState;
    using Witness = witness_t<MegaCircuitBuilder>;

    // K=4 compressed encoding: w_l, w_r, w_o, w_4 = state[0] at rounds 4i+0, 4i+1, 4i+2, 4i+3.
    // (s_1, s_2, s_3) at row-start are derived inside the relation via a 3x3 Vandermonde solve.
    static_assert(Permutation::rounds_p % 4 == 0);
    constexpr size_t num_quad_rows = Permutation::rounds_p / 4; // 14 rows for rounds_p = 56

    // Entry transition row (standard encoding): its wires are the first external group's output state,
    // pinned by that group's last external round relation via w_shift (the rows are contiguous in the
    // shared `poseidon2` block). The relation forces the first compressed row's
    // (w_r_shift, w_o_shift, w_4_shift) to state[0] at rounds start+1, +2, +3.
    {
        poseidon2_transition_entry_gate_<FF> in{
            current_state[0].get_witness_index(),
            current_state[1].get_witness_index(),
            current_state[2].get_witness_index(),
            current_state[3].get_witness_index(),
            rounds_f_beginning,
        };
        builder->create_poseidon2_transition_entry_gate(in);
    }

    auto advance_internal_round = [](NativeState& state, const FF& round_constant) {
        state[0] += round_constant;
        Permutation::NativePermutation::apply_single_sbox(state[0]);
        Permutation::NativePermutation::matrix_multiplication_internal(state);
    };

    // Helper: emit one K=4 compressed row (interior or terminal) and advance `current_state`
    // by 4 internal rounds. The row wires are state[0] at rounds start, start+1, start+2, start+3.
    auto emit_quad_row = [&](size_t quad_idx, bool is_terminal) {
        const size_t start = rounds_f_beginning + (4 * quad_idx);
        const size_t next_start = start + 4; // ignored on terminal

        NativeState state_after_1 = current_native_state;
        advance_internal_round(state_after_1, Permutation::round_constants[start + 0][0]);
        auto s0_at_1 = Witness(builder, state_after_1[0]);
        builder->tag_duplicate_provenance(
            s0_at_1.witness_index,
            poseidon2_slot_provenance_key<MegaCircuitBuilder>(
                builder,
                input_id,
                { static_cast<uint64_t>(Poseidon2ProvenanceSlot::COMPRESSED_INTERNAL), start + 1, 0 }));

        NativeState state_after_2 = state_after_1;
        advance_internal_round(state_after_2, Permutation::round_constants[start + 1][0]);
        auto s0_at_2 = Witness(builder, state_after_2[0]);
        builder->tag_duplicate_provenance(
            s0_at_2.witness_index,
            poseidon2_slot_provenance_key<MegaCircuitBuilder>(
                builder,
                input_id,
                { static_cast<uint64_t>(Poseidon2ProvenanceSlot::COMPRESSED_INTERNAL), start + 2, 0 }));

        NativeState state_after_3 = state_after_2;
        advance_internal_round(state_after_3, Permutation::round_constants[start + 2][0]);
        auto s0_at_3 = Witness(builder, state_after_3[0]);
        builder->tag_duplicate_provenance(
            s0_at_3.witness_index,
            poseidon2_slot_provenance_key<MegaCircuitBuilder>(
                builder,
                input_id,
                { static_cast<uint64_t>(Poseidon2ProvenanceSlot::COMPRESSED_INTERNAL), start + 3, 0 }));

        poseidon2_quad_internal_gate_<FF> in{
            current_state[0].get_witness_index(), // state[0] at round start
            s0_at_1.witness_index,                // state[0] at round start+1
            s0_at_2.witness_index,                // state[0] at round start+2
            s0_at_3.witness_index,                // state[0] at round start+3
            start,
            next_start,
            is_terminal,
        };
        builder->create_poseidon2_quad_internal_gate(in);

        // Advance native state by the 4th round to land on state at round start+4.
        current_native_state = state_after_3;
        advance_internal_round(current_native_state, Permutation::round_constants[start + 3][0]);

        // The next non-terminal compressed row only consumes state[0] at round start+4. The remaining limbs are
        // derived inside the relation and do not need witnesses until the terminal row bridges back to the
        // standard encoding consumed by the final external rounds.
        current_state[0] = Witness(builder, current_native_state[0]);
        builder->tag_duplicate_provenance(
            current_state[0].get_witness_index(),
            poseidon2_slot_provenance_key<MegaCircuitBuilder>(
                builder,
                input_id,
                { static_cast<uint64_t>(Poseidon2ProvenanceSlot::COMPRESSED_INTERNAL), start + 4, 0 }));
        if (is_terminal) {
            for (size_t j = 1; j < Permutation::t; ++j) {
                current_state[j] = Witness(builder, current_native_state[j]);
                builder->tag_duplicate_provenance(
                    current_state[j].get_witness_index(),
                    poseidon2_slot_provenance_key<MegaCircuitBuilder>(
                        builder,
                        input_id,
                        { static_cast<uint64_t>(Poseidon2ProvenanceSlot::COMPRESSED_INTERNAL), start + 4, j }));
            }
        }
    };

    // 13 interior compressed rows (covering rounds 0..51 relative)
    for (size_t q = 0; q < num_quad_rows - 1; ++q) {
        emit_quad_row(q, /*is_terminal=*/false);
    }
    // 1 terminal compressed row (covering rounds 52..55 relative)
    emit_quad_row(num_quad_rows - 1, /*is_terminal=*/true);
}

} // namespace

template <typename Builder>
typename Poseidon2Permutation<Builder>::State Poseidon2Permutation<Builder>::permutation(
    Builder* builder, const typename Poseidon2Permutation<Builder>::State& input)
{
    // Identity of the four input-state witnesses, computed before the initial linear layer mutates the state. It is
    // combined with an exact generated-state slot whenever a fresh Poseidon2 witness is tagged.
    const auto input_id = permutation_input_local_id<Builder>(builder, input);

    State current_state(input);
    NativeState current_native_state;

    matrix_multiplication_external(current_state);
    if constexpr (IsMegaBuilder<Builder>) {
        // The Mega initial-external layer materializes the post-matrix state as fresh witnesses; tag them too.
        for (size_t j = 0; j < t; ++j) {
            builder->tag_duplicate_provenance(
                current_state[j].get_witness_index(),
                poseidon2_slot_provenance_key<Builder>(
                    builder, input_id, { static_cast<uint64_t>(Poseidon2ProvenanceSlot::INITIAL_EXTERNAL), j }));
        }
    }
    sync_native_state_from_state<Builder>(current_native_state, current_state);

    // First set of external rounds
    constexpr size_t rounds_f_beginning = rounds_f / 2;
    apply_external_rounds(
        builder, current_state, current_native_state, /*begin=*/0, /*end=*/rounds_f_beginning, input_id);

    // Ultra needs an explicit landing row for the first external group's output. On Mega every poseidon2 gate lives
    // in the single `poseidon2` block, so the transition-entry row emitted next is the external relation's
    // w_shift target directly -- no separate propagate row.
    if constexpr (!IsMegaBuilder<Builder>) {
        propagate_current_state_to_next_row(builder, current_state, builder->blocks.poseidon2_external);
    }

    // Internal rounds: Mega uses a K=4 compressed block; Ultra keeps the standard one-round layout.
    const size_t p_end = rounds_f_beginning + rounds_p;
    if constexpr (IsMegaBuilder<Builder>) {
        apply_mega_internal_rounds(builder, current_state, current_native_state, rounds_f_beginning, input_id);
    } else {
        apply_standard_internal_rounds(
            builder, current_state, current_native_state, rounds_f_beginning, p_end, input_id);
    }

    // Remaining external rounds
    apply_external_rounds(builder, current_state, current_native_state, /*begin=*/p_end, /*end=*/NUM_ROUNDS, input_id);

    // Landing row for the final external round's output (the permutation result). On Mega it sits in the shared
    // `poseidon2` block so the whole permutation remains contiguous.
    if constexpr (IsMegaBuilder<Builder>) {
        propagate_current_state_to_next_row(builder, current_state, builder->blocks.poseidon2);
    } else {
        propagate_current_state_to_next_row(builder, current_state, builder->blocks.poseidon2_external);
    }

    return current_state;
}

/**
 * @brief Separate function to do just the first linear layer (equivalent to external matrix mul).
 * @details Update the state with \f$ M_E \cdot (\text{state}[0], \text{state}[1], \text{state}[2],
 * \text{state}[3])^{\top}\f$. Where \f$ M_E \f$ is the external round matrix. See `Poseidon2ExternalRelationImpl`.
 */
template <typename Builder>
void Poseidon2Permutation<Builder>::matrix_multiplication_external(State& state)
    requires(!IsMegaBuilder<Builder>)
{
    const bb::fr two(2);
    const bb::fr four(4);
    // create the 6 gates for the initial matrix multiplication
    // gate 1: Compute tmp1 = state[0] + state[1] + 2 * state[3]
    field_t<Builder> tmp1 = state[0].add_two(state[1], state[3] * two);

    // gate 2: Compute tmp2 = 2 * state[1] + state[2] + state[3]
    field_t<Builder> tmp2 = state[2].add_two(state[1] * two, state[3]);

    // gate 3: Compute v2 = 4 * state[0] + 4 * state[1] + tmp2
    state[1] = tmp2.add_two(state[0] * four, state[1] * four);

    // gate 4: Compute v1 = v2 + tmp1
    state[0] = state[1] + tmp1;

    // gate 5: Compute v4 = tmp1 + 4 * state[2] + 4 * state[3]
    state[3] = tmp1.add_two(state[2] * four, state[3] * four);

    // gate 6: Compute v3 = v4 + tmp2
    state[2] = state[3] + tmp2;
}

template <typename Builder>
void Poseidon2Permutation<Builder>::matrix_multiplication_external(State& state)
    requires IsMegaBuilder<Builder>
{
    Builder* builder = validate_context<Builder>(state);
    BB_ASSERT(builder != nullptr, "Poseidon2 Mega initial external layer needs a builder context");

    NativeState native_state;
    for (size_t i = 0; i < t; ++i) {
        native_state[i] = state[i].get_value();
    }
    NativePermutation::matrix_multiplication_external(native_state);

    materialize_constants_for_initial_layer(builder, state);

    poseidon2_initial_external_gate_<FF> in{ state[0].get_witness_index(),
                                             state[1].get_witness_index(),
                                             state[2].get_witness_index(),
                                             state[3].get_witness_index() };
    builder->create_poseidon2_initial_external_gate(in);
    for (size_t j = 0; j < t; ++j) {
        state[j] = witness_t<Builder>(builder, native_state[j]);
    }
}

template class Poseidon2Permutation<MegaCircuitBuilder>;
template class Poseidon2Permutation<UltraCircuitBuilder>;

} // namespace bb::stdlib
