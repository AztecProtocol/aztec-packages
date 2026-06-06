use crate::{
    abis::{PaddedSideEffects, PrivateKernelResetHints},
    components::{
        reset_output_composer::{ResetOutputComposer, SquashedOutputArrayHints},
        reset_output_validator::ResetOutputValidator,
    },
};
use types::{
    abis::private_kernel_data::{PrivateKernelData, PrivateKernelDataWithoutPublicInputs},
    constants::{
        PRIVATE_KERNEL_INIT_2_VK_INDEX, PRIVATE_KERNEL_INIT_3_VK_INDEX,
        PRIVATE_KERNEL_INIT_VK_INDEX, PRIVATE_KERNEL_INNER_2_VK_INDEX,
        PRIVATE_KERNEL_INNER_3_VK_INDEX, PRIVATE_KERNEL_INNER_VK_INDEX,
        PRIVATE_KERNEL_RESET_VK_INDEX,
    },
    PrivateKernelCircuitPublicInputs,
};

pub global ALLOWED_PREVIOUS_CIRCUITS: [u32; 7] = [
    PRIVATE_KERNEL_INIT_VK_INDEX,
    PRIVATE_KERNEL_INIT_2_VK_INDEX,
    PRIVATE_KERNEL_INIT_3_VK_INDEX,
    PRIVATE_KERNEL_INNER_VK_INDEX,
    PRIVATE_KERNEL_INNER_2_VK_INDEX,
    PRIVATE_KERNEL_INNER_3_VK_INDEX,
    PRIVATE_KERNEL_RESET_VK_INDEX,
];

// # The Reset Circuit
//
// The "Reset Circuit" is so named because it processes large arrays of "requests" (see below);
// thereby eventually resetting those arrays to empty.
//
// An app circuit can make several kinds of "request" to the kernel circuit, by appending data to
// certain arrays in its PrivateCircuitPublicInputs. The arrays from each app circuit are
// progressively appended to the kernel circuits' larger arrays of requests, until we can't
// fit any more requests into those fixed-size arrays (or until we have processed all app circuits
// of the tx).
//
// We must then execute a "Reset Circuit" to process and remove some items from those arrays, so
// that we can make some room, so that we can resume iterating through Inner Kernel circuits to
// process the rest of the app circuits of the tx -- each of which might append more
// requests to the kernel's arrays of requests. By the end of the tx, all of these arrays of requests
// must be empty.
//
// A tx might need to intersperse multiple Reset Kernel circuits between Init/Inner Kernel circuit
// iterations, depending on the tx.
//
// The Reset circuit processes the following kinds of request (explained further down):
//
// - Note Hash Read Request
// - Nullifier Read Request
// - Key Validation Request
//
// Not only does it process these "requests", we have also given it responsibilities to process
// other side-effects that are emitted by app circuits:
//
// - Siloing: Applies contract-specific siloing to note hashes, nullifiers, and logs for scoping and privacy
// - Padding: Pads accumulated arrays to obscure their true sizes for privacy
// - Transient data squashing: removing note_hash/nullifier pairs where a note is created and nullified within the
//                             current transaction, along with its associated logs.
//
// ## Read Requests:
//
// ### Note Read Requests
//
// App circuits can outsource Merkle Membership checks to a Reset Kernel circuit, to avoid hard-coding
// a rigid number of costly Merkle Membership constraints within the the App circuit itself.
//
// For example, a simple private token transfer circuit might sometimes only need to read 1 note to
// amass sufficient funds for a transfer, whilst other times 8 notes might need to be read. If all
// of the app's note existence constraints (Merkle membership constraints) were hard-coded in the
// app circuit, then the proving time would always be burdened by those 8 lots of constraints even
// if only 1 lot is needed.
// By outsourcing existence checks to the Reset Kernel circuit, we can dynamically choose to execute
// a variant of the Reset circuit which performs the smallest number of Merkle membership checks
// that are needed to assert existence of all the input notes to a tx, based on the chosen-at-runtime
// notes that a user happens to feed-into the app circuits of their transaction.
//
// So if a user has a single note containing $1m, but they only need to send $10, they could inject
// 1 note to a token transfer app circuit. The app circuit can then append a so-called
// "Note Read Request" to the `note_hash_read_requests` array of its PrivateCircuitPublicInputs,
// which the kernel circuit(s) will eventually propagate to an instance of the Reset circuit.
//
// > A read request is a request from an app circuit to the kernel circuits to assert existence of a
// > Note_Hash (or Nullifier) in the Note_Hash (or Nullifier) Merkle tree.
//
// If (for example's sake) this were the only "Note Read Request" of the entire tx, then we should
// load a variant of the Reset circuit can process a very small number of read requests, so as to
// save on proving time.
//
// If, alternatively, a user has ten notes, each containing $1, then to send $10 they would need to
// inject ten notes into the token transfer app circuit (presuming the circuit has been designed to
// enable so many notes to be injected). The app circuit can then append _ten_ "Note Hash Read Requests"
// to the `note_hash_read_requests` array of its PrivateCircuitPublicInputs, which the kernel
// circuit(s) will eventually propagate to an instance of the Reset circuit. We would then need to
// load a variant of the Reset circuit which can process at least 10 "Note Hash Read Requests".
//
// It could be that two (or more) app circuits each make so many "Read Requests" that even the
// largest variant of the Reset circuit can't process them all at once. In that case, an instance
// of the Reset circuit would need to be invoked multiple times, with each invocation processing a
// subset of the read requests, until all of them have been handled.
//
// ### Nullifier Read Requests
//
// In addition to reading the preimages of _notes_, some apps might want to read the preimages of
// _nullifiers_. There are some Aztec smart contract design patterns where state can be stored in
// nullifiers instead of notes. For example, we store "the fact that a contract has been published"
// in a "contract instance nullifier", and so many app circuits need the ability to read the contents
// of that nullifier to prove information about the contract.

/// Another explanation, because why not:
/// TODO: combine explanations
/// The Private Kernel Reset circuit performs cleanup and validation on accumulated transaction data. Two entry
/// points share this struct and its variant catalog:
/// - Inner resets (`execute`): invoked mid-tx to drain accumulated requests so that subsequent Inner kernels have
///   room to append more. May be invoked any number of times during private execution. These do not silo. The inner
///   `execute` `static_assert`s that the three `*SiloingAmount` generics are zero.
/// - Final resets (`execute_as_terminal`): invoked exactly once at the end of private execution. Live inside the
///   `reset_tail` / `reset_tail_to_public` circuits, which both perform the final reset and produce the tail output
///   in a single circuit. These do silo, and no further reset is permitted after a `reset_tail`.
///
/// It performs:
/// - Read request validation: Verifies note hash and nullifier read requests against pending data (from this
///   transaction) or settled data (from historical state via membership proofs)
/// - Key validation: Validates key derivation requests used for nullifier key generation
/// - Transient data squashing: Removes note hash/nullifier pairs where a note is created and nullified within the
///   current transaction, along with their associated logs
/// - Siloing (final reset only): Applies contract-specific siloing to note hashes, nullifiers, and logs for scoping
///   and privacy
/// - Padding: Pads accumulated arrays to obscure their true sizes for privacy
///
/// The Reset circuit is parameterized by the number of each type of operation to perform, allowing multiple "variants"
/// optimized for different transaction patterns.
///
/// The vk indexes of all the reset variants are allocated after the PRIVATE_KERNEL_RESET_VK_INDEX.
///
/// TODO(https://github.com/AztecProtocol/aztec-packages-private/issues/147): siloing should live in its own component
/// so it's syntactically obvious it's only invoked from the terminal path.

pub struct PrivateKernelResetCircuitPrivateInputs<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> {
    previous_kernel: PrivateKernelData,
    padded_side_effects: PaddedSideEffects,
    hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
}

impl<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> PrivateKernelResetCircuitPrivateInputs<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen> {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        padded_side_effects: PaddedSideEffects,
        hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
    ) -> Self {
        Self {
            previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
            padded_side_effects,
            hints,
        }
    }

    unconstrained fn generate_output<let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32, let KeyValidationAmount: u32>(
        self,
    ) -> (PrivateKernelCircuitPublicInputs, SquashedOutputArrayHints) {
        let composer = ResetOutputComposer::new(
            self.previous_kernel.public_inputs,
            self.padded_side_effects,
            self.hints.transient_data_squashing_hints,
            self.hints.note_hash_read_request_hints.read_request_actions,
            self.hints.nullifier_read_request_hints.read_request_actions,
        );
        (
            composer
                .finish::<NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount, KeyValidationAmount>(),
            composer.squashed_output_array_hints,
        )
    }

    pub fn execute<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32, let TransientDataSquashingAmount: u32, let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) -> PrivateKernelCircuitPublicInputs {
        // Siloing is only performed by the terminal reset+tail circuits (see `execute_as_terminal`).
        std::static_assert(
            NoteHashSiloingAmount == 0,
            "inner reset must not silo note hashes",
        );
        std::static_assert(
            NullifierSiloingAmount == 0,
            "inner reset must not silo nullifiers",
        );
        std::static_assert(
            PrivateLogSiloingAmount == 0,
            "inner reset must not silo private logs",
        );

        let previous_public_inputs = self.previous_kernel.public_inputs;

        // A subsequent kernel will recursively verify this inner reset's output, so PROOF_TYPE_HN
        // (not HN_TAIL) is the right proof type. See `execute_as_terminal` for the terminal caller.
        if !::std::runtime::is_unconstrained() {
            self.previous_kernel.verify(false);
            self.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        // Safety: The output is validated below by ResetOutputValidator.
        let (output, squashed_output_array_hints) = unsafe {
            self
                .generate_output::<NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount, KeyValidationAmount>()
        };

        if ::types::validate::should_validate_output() {
            ResetOutputValidator::new(
                output,
                previous_public_inputs,
                self.padded_side_effects,
                self.hints,
                squashed_output_array_hints,
            )
                .validate::<NoteHashPendingReadAmount, NoteHashSettledReadAmount, NullifierPendingReadAmount, NullifierSettledReadAmount, KeyValidationAmount, TransientDataSquashingAmount, NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount>();
        }

        output
    }

    /// Terminal reset entry point used by the `reset_tail` / `reset_tail_to_public` circuits. Uses
    /// PROOF_TYPE_HN_TAIL for the recursive verify since this is the last reset kernel in the chain.
    /// Inlined rather than delegating to `execute` because routing the `is_last_kernel` flag through
    /// a call boundary defeats Noir's constant-folding of `verify(...)` and costs ~3k constraints
    /// per variant.
    pub fn execute_as_terminal<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32, let TransientDataSquashingAmount: u32, let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) -> PrivateKernelCircuitPublicInputs {
        let previous_public_inputs = self.previous_kernel.public_inputs;

        if !::std::runtime::is_unconstrained() {
            self.previous_kernel.verify(true);
            self.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        // Safety: The output is validated below by ResetOutputValidator.
        let (output, squashed_output_array_hints) = unsafe {
            self
                .generate_output::<NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount, KeyValidationAmount>()
        };

        if ::types::validate::should_validate_output() {
            ResetOutputValidator::new(
                output,
                previous_public_inputs,
                self.padded_side_effects,
                self.hints,
                squashed_output_array_hints,
            )
                .validate::<NoteHashPendingReadAmount, NoteHashSettledReadAmount, NullifierPendingReadAmount, NullifierSettledReadAmount, KeyValidationAmount, TransientDataSquashingAmount, NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount>();
        }

        output
    }
}
