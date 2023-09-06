#include "common.hpp"
#include "init.hpp"

#include "aztec3/circuits/abis/kernel_circuit_public_inputs_final.hpp"
#include "aztec3/circuits/abis/previous_kernel_data.hpp"
#include "aztec3/circuits/abis/private_kernel/private_kernel_inputs_ordering.hpp"
#include "aztec3/circuits/hash.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/array.hpp"
#include "aztec3/utils/circuit_errors.hpp"
#include "aztec3/utils/dummy_circuit_builder.hpp"

#include <barretenberg/numeric/uint256/uint256.hpp>

namespace {
using NT = aztec3::utils::types::NativeTypes;

using aztec3::circuits::abis::KernelCircuitPublicInputsFinal;
using aztec3::circuits::abis::PreviousKernelData;
using aztec3::circuits::abis::private_kernel::PrivateKernelInputsOrdering;
using aztec3::circuits::kernel::private_kernel::common_initialise_end_values;
using aztec3::utils::array_rearrange;
using aztec3::utils::CircuitErrorCode;
using aztec3::utils::DummyCircuitBuilder;

void initialise_end_values(PreviousKernelData<NT> const& previous_kernel,
                           KernelCircuitPublicInputsFinal<NT>& public_inputs)
{
    common_initialise_end_values(previous_kernel, public_inputs);
    public_inputs.end.new_contracts = previous_kernel.public_inputs.end.new_contracts;
}
}  // namespace


namespace aztec3::circuits::kernel::private_kernel {

void match_reads_to_note_hashes(DummyCircuitBuilder& builder,
                                std::array<NT::fr, MAX_READ_REQUESTS_PER_TX> const& read_requests,
                                std::array<NT::fr, MAX_READ_REQUESTS_PER_TX> const& read_note_hash_hints,
                                std::array<NT::fr, MAX_NEW_NOTE_HASHES_PER_TX> const& new_note_hashes)
{
    // match reads to note_hashes from the previous call(s)
    for (size_t rr_idx = 0; rr_idx < MAX_READ_REQUESTS_PER_TX; rr_idx++) {
        const auto& read_request = read_requests[rr_idx];
        const auto& read_note_hash_hint = read_note_hash_hints[rr_idx];
        const auto hint_pos = static_cast<size_t>(uint64_t(read_note_hash_hint));

        if (read_request != 0) {
            size_t match_pos = MAX_NEW_NOTE_HASHES_PER_TX;
            if (hint_pos < MAX_NEW_NOTE_HASHES_PER_TX) {
                match_pos = read_request == new_note_hashes[hint_pos] ? hint_pos : match_pos;
            }

            builder.do_assert(
                match_pos != MAX_NEW_NOTE_HASHES_PER_TX,
                format("read_request at position [",
                       rr_idx,
                       "]* is transient but does not match any new note_hash.",
                       "\n\tread_request: ",
                       read_request,
                       "\n\thint_to_note_hash: ",
                       read_note_hash_hint,
                       "\n\t* the read_request position/index is not expected to match position in app-circuit "
                       "outputs because kernel iterations gradually remove non-transient read_requests as "
                       "membership checks are resolved."),
                CircuitErrorCode::PRIVATE_KERNEL__TRANSIENT_READ_REQUEST_NO_MATCH);
        }
    }
}

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/837): optimized based on hints
// regarding matching a nullifier to a note_hash
// i.e., we get pairs i,j such that new_nullifiers[i] == new_note_hashes[j]

/**
 * @brief This function matches transient nullifiers to note_hashes and squashes (deletes) them both.
 *
 * @details A non-zero entry in nullified_note_hashes at position i implies that
 * 1) new_note_hashes array contains at least an occurence of nullified_note_hashes[i]
 * 2) this note_hash is nullified by new_nullifiers[i] (according to app circuit, the kernel cannot check this on its
 * own.)
 * Remark: We do not check that new_nullifiers[i] is non-empty. (app circuit responsibility)
 *
 * @param builder
 * @param new_nullifiers public_input's nullifiers that should be squashed when matching a transient note_hash
 * @param nullified_note_hashes note_hashes that each new_nullifier nullifies. 0 here implies non-transient nullifier,
 * and a non-zero `nullified_note_hash` implies a transient nullifier that MUST be matched to a new_note_hashes.
 * @param new_note_hashes public_input's note_hashes to be matched against and squashed when matched to a transient
 * nullifier.
 */
void match_nullifiers_to_note_hashes_and_squash(
    DummyCircuitBuilder& builder,
    std::array<NT::fr, MAX_NEW_NULLIFIERS_PER_TX>& new_nullifiers,
    std::array<NT::fr, MAX_NEW_NULLIFIERS_PER_TX> const& nullified_note_hashes,
    std::array<NT::fr, MAX_NEW_NULLIFIERS_PER_TX> const& nullifier_note_hash_hints,
    std::array<NT::fr, MAX_NEW_NOTE_HASHES_PER_TX>& new_note_hashes)
{
    // match nullifiers/nullified_note_hashes to note_hashes from the previous call(s)
    for (size_t n_idx = 0; n_idx < MAX_NEW_NULLIFIERS_PER_TX; n_idx++) {
        const auto& nullified_note_hash = nullified_note_hashes[n_idx];
        const auto& nullifier_note_hash_hint = nullifier_note_hash_hints[n_idx];
        const auto hint_pos = static_cast<size_t>(uint64_t(nullifier_note_hash_hint));
        // Nullified_note_hash of value `EMPTY_NULLIFIED_NOTE_HASH` implies non-transient (persistable)
        // nullifier in which case no attempt will be made to match it to a note_hash.
        // Non-empty nullified_note_hash implies transient nullifier which MUST be matched to a note_hash below!
        // 0-valued nullified_note_hash is empty and will be ignored
        if (nullified_note_hashes[n_idx] != NT::fr(0) &&
            nullified_note_hashes[n_idx] != NT::fr(EMPTY_NULLIFIED_NOTE_HASH)) {
            size_t match_pos = MAX_NEW_NOTE_HASHES_PER_TX;

            if (hint_pos < MAX_NEW_NOTE_HASHES_PER_TX) {
                match_pos = nullified_note_hash == new_note_hashes[hint_pos] ? hint_pos : match_pos;
            }

            if (match_pos != MAX_NEW_NOTE_HASHES_PER_TX) {
                // match found!
                // squash both the nullifier and the note_hash
                // (set to 0 here and then rearrange array after loop)
                important("chopped note_hash for siloed inner hash note \n", new_note_hashes[match_pos]);
                new_note_hashes[match_pos] = NT::fr(0);
                new_nullifiers[n_idx] = NT::fr(0);
            } else {
                // Transient nullifiers MUST match a pending note_hash
                builder.do_assert(false,
                                  format("new_nullifier at position [",
                                         n_idx,
                                         "]* is transient but does not match any new note_hash.",
                                         "\n\tnullifier: ",
                                         new_nullifiers[n_idx],
                                         "\n\tnullified_note_hash: ",
                                         nullified_note_hashes[n_idx]),
                                  CircuitErrorCode::PRIVATE_KERNEL__TRANSIENT_NEW_NULLIFIER_NO_MATCH);
            }
        }
        // non-transient (persistable) nullifiers are just kept in new_nullifiers array and forwarded
        // to public inputs (used later by base rollup circuit)
    }
    // Move all zero-ed (removed) entries of these arrays to the end and preserve ordering of other entries
    array_rearrange(new_note_hashes);
    array_rearrange(new_nullifiers);
}

void apply_note_hash_nonces(NT::fr const& first_nullifier,
                            std::array<NT::fr, MAX_NEW_NOTE_HASHES_PER_TX>& new_note_hashes)
{
    for (size_t c_idx = 0; c_idx < MAX_NEW_NOTE_HASHES_PER_TX; c_idx++) {
        // Apply nonce to all non-zero/non-empty note_hashes
        // Nonce is the hash of the first (0th) nullifier and the note_hash's index into new_note_hashes array
        const auto nonce = compute_note_hash_nonce<NT>(first_nullifier, c_idx);
        new_note_hashes[c_idx] =
            new_note_hashes[c_idx] == 0 ? 0 : compute_unique_note_hash<NT>(nonce, new_note_hashes[c_idx]);
    }
}

KernelCircuitPublicInputsFinal<NT> native_private_kernel_circuit_ordering(
    DummyCircuitBuilder& builder, PrivateKernelInputsOrdering<NT> const& private_inputs)
{
    // We'll be pushing data to this during execution of this circuit.
    KernelCircuitPublicInputsFinal<NT> public_inputs{};

    // Do this before any functions can modify the inputs.
    initialise_end_values(private_inputs.previous_kernel, public_inputs);

    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1329): validate that 0th nullifier is nonzero
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1486): validate that `len(new_nullifiers) ==
    // len(nullified_note_hashes)`

    // Matching read requests to pending note_hashes requires the full list of new note_hashes accumulated over
    // all iterations of the private kernel. Therefore, we match reads against new_note_hashes in
    // previous_kernel.public_inputs.end, where "previous kernel" is the last "inner" kernel iteration.
    // Remark: The note_hashes in public_inputs.end have already been siloed by contract address!
    match_reads_to_note_hashes(builder,
                               private_inputs.previous_kernel.public_inputs.end.read_requests,
                               private_inputs.read_note_hash_hints,
                               private_inputs.previous_kernel.public_inputs.end.new_note_hashes);

    // Matching nullifiers to pending note_hashes requires the full list of new note_hashes accumulated over
    // all iterations of the private kernel. Therefore, we match nullifiers (their nullified_note_hashes)
    // against new_note_hashes in public_inputs.end which has been initialized to
    // previous_kernel.public_inputs.end in common_initialise_*() above.
    // Remark: The note_hashes in public_inputs.end have already been siloed by contract address!
    match_nullifiers_to_note_hashes_and_squash(builder,
                                               public_inputs.end.new_nullifiers,
                                               public_inputs.end.nullified_note_hashes,
                                               private_inputs.nullifier_note_hash_hints,
                                               public_inputs.end.new_note_hashes);

    // tx hash
    const auto& first_nullifier = private_inputs.previous_kernel.public_inputs.end.new_nullifiers[0];
    apply_note_hash_nonces(first_nullifier, public_inputs.end.new_note_hashes);

    return public_inputs;
};

}  // namespace aztec3::circuits::kernel::private_kernel