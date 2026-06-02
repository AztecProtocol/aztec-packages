use alloc::vec::Vec;
use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::ExecutionResult;
use zkvm_data_types::types::{AztecAddress, FunctionSelector};
use zkvm_data_types::domain_separator;
use zkvm_aztec_sdk::context::PrivateContext;

/// Realistic token transfer with FPC fee payment.
///
/// Call tree:
///   account.entrypoint
///   ├─ SETUP (non-revertible):
///   │   └─ fpc.fee_entrypoint_private
///   │       ├─ fee_token.transfer_to_public(sender → fpc, max_fee)
///   │       │   └─ account.verify_private_authwit → authwit nullifier (1 Poseidon2)
///   │       ├─ set_as_fee_payer()
///   │       └─ end_setup()
///   └─ APP (revertible):
///       └─ token.transfer(sender → recipient)
///           ├─ subtract_balance: 2 nullifiers (2 Poseidon2 each: note_hash + nullifier)
///           ├─ 1 change note hash (1 Poseidon2)
///           └─ 1 recipient note hash (1 Poseidon2)
///
/// Crypto work (all real Poseidon2 via P::poseidon2_hash):
///   Contract-side: ~8 Poseidon2 (note hashes, nullifiers, authwit)
///   Kernel-side:   ~6 Poseidon2 (silos, nonces, unique hashes)
///   Total:         ~14 Poseidon2 calls
pub fn token_transfer_with_fpc<P: Precompiles>(
    account_address: AztecAddress<P::Digest>,
    token_address: AztecAddress<P::Digest>,
    fpc_address: AztecAddress<P::Digest>,
    sender: AztecAddress<P::Digest>,
    recipient: AztecAddress<P::Digest>,
    params: &TransferParams<P::Digest>,
) -> ExecutionResult<P::Digest> {
    // --- Account entrypoint ---
    let mut entrypoint_ctx = PrivateContext::new(
        account_address, sender,
        FunctionSelector { inner: 0xaf9f8c44 },
        0,
    );
    // Account entrypoint: verify Schnorr signature over action hash.
    // Always called to measure EC operation cycle cost.
    // For NativePrecompiles (stub): returns true.
    // For real impls: does 2 EC scalar muls + Poseidon2 challenge hash.
    // Result not asserted — may fail with stub signature data, but the
    // cryptographic work (EC ops) is still performed and proven.
    {
        let action_hash = P::poseidon2_hash(&[
            sender.inner, token_address.inner, params.fee_args_hash,
        ]);
        let action_bytes = action_hash.to_bytes32();
        let _sig_valid = P::verify_signature(
            &params.pubkey_x,
            &params.pubkey_y,
            &params.signature,
            &action_bytes,
        );
    }

    // --- SETUP PHASE: FPC fee payment ---

    // FPC calls fee_token.transfer_to_public(sender, fpc, max_fee)
    let mut fee_transfer_ctx = PrivateContext::new(
        token_address, fpc_address,
        FunctionSelector { inner: 0x02 },
        entrypoint_ctx.current_counter(),
    );

    // Authwit check: compute inner_hash = H(caller, selector, args_hash)
    let authwit_inner_hash = P::poseidon2_hash(&[
        fpc_address.inner,
        P::Digest::from_bytes32(&FunctionSelector { inner: 0x02 }.inner.to_le_bytes().iter().chain([0u8; 28].iter()).copied().collect::<Vec<u8>>().try_into().unwrap_or([0u8; 32])),
        params.fee_args_hash,
    ]);
    // Authwit nullifier: H_sep(account_addr, inner_hash, AUTHWIT_NULLIFIER)
    let authwit_nullifier = P::poseidon2_hash_with_separator(
        &[account_address.inner, authwit_inner_hash],
        domain_separator::AUTHWIT_NULLIFIER,
    );

    let mut authwit_ctx = PrivateContext::new(
        account_address, token_address,
        FunctionSelector { inner: 0xac },
        fee_transfer_ctx.current_counter(),
    );
    authwit_ctx.emit_nullifier(authwit_nullifier);

    // Fee transfer enqueues a public call
    let fee_end = authwit_ctx.current_counter();
    fee_transfer_ctx = PrivateContext::new(
        token_address, fpc_address,
        FunctionSelector { inner: 0x02 },
        fee_end,
    );
    fee_transfer_ctx.enqueue_public_call(
        token_address,
        FunctionSelector { inner: 0x03 },
        params.fee_calldata_hash,
    );

    // FPC sets fee payer
    let mut fpc_ctx = PrivateContext::new(
        fpc_address, account_address,
        FunctionSelector { inner: 0x01 },
        fee_transfer_ctx.current_counter(),
    );
    fpc_ctx.set_as_fee_payer();
    let setup_end = fpc_ctx.current_counter();

    // --- APP PHASE: token.transfer ---

    let mut transfer_ctx = PrivateContext::new(
        token_address, account_address,
        FunctionSelector { inner: 0x04 },
        setup_end,
    );

    // Consume sender's note 0: read from tree (generates Merkle proof check),
    // compute note_hash, emit nullifier
    let sender_nh_0 = P::poseidon2_hash(&[
        sender.inner, params.sender_value_0, params.sender_randomness_0,
    ]);
    // Read request: the kernel will verify this note hash exists in the tree
    // via a 42-deep Merkle membership proof (42 × Poseidon2 compress)
    transfer_ctx.push_note_hash_read_request(sender_nh_0);

    let sender_null_0 = P::poseidon2_hash_with_separator(
        &[sender_nh_0, params.sender_secret_key],
        domain_separator::NOTE_NULLIFIER,
    );
    transfer_ctx.emit_nullifier_for_note_hash(sender_null_0, sender_nh_0, 0);

    // Consume sender's note 1: same pattern — read from tree + nullify
    let sender_nh_1 = P::poseidon2_hash(&[
        sender.inner, params.sender_value_1, params.sender_randomness_1,
    ]);
    transfer_ctx.push_note_hash_read_request(sender_nh_1);

    let sender_null_1 = P::poseidon2_hash_with_separator(
        &[sender_nh_1, params.sender_secret_key],
        domain_separator::NOTE_NULLIFIER,
    );
    transfer_ctx.emit_nullifier_for_note_hash(sender_null_1, sender_nh_1, 1);

    // Create change note for sender
    let change_nh = P::poseidon2_hash(&[
        sender.inner, params.change_value, params.change_randomness,
    ]);
    transfer_ctx.emit_note_hash(change_nh);

    // Create note for recipient
    let recipient_nh = P::poseidon2_hash(&[
        recipient.inner, params.recipient_value, params.recipient_randomness,
    ]);
    transfer_ctx.emit_note_hash(recipient_nh);

    // Encrypt note data before emitting as private log.
    // In real Aztec, private notes are AES-128-CBC encrypted with the
    // recipient's ephemeral shared secret before being emitted as logs.
    // `aes128_encrypt` is constrained symmetric encryption — backends may
    // implement this as Poseidon2 sponge, ChaCha20, or actual AES depending
    // on what is efficient to prove in the target zkVM.
    let enc_key: [u8; 16] = [0x42u8; 16]; // deterministic fixture key
    let enc_iv:  [u8; 16] = [0x01u8; 16]; // deterministic fixture IV
    let _change_ciphertext    = P::aes128_encrypt(&change_nh.to_bytes32(),    &enc_key, &enc_iv);
    let _recipient_ciphertext = P::aes128_encrypt(&recipient_nh.to_bytes32(), &enc_key, &enc_iv);

    // Emit transfer event log (log content is the recipient note hash;
    // the encryption cost above is what we are measuring in the benchmark)
    transfer_ctx.emit_private_log(alloc::vec![recipient_nh]);

    // --- Assemble call tree ---
    let authwit_result = authwit_ctx.into_execution_result();
    let mut fee_transfer_result = fee_transfer_ctx.into_execution_result();
    fee_transfer_result.nested_results.push(authwit_result);

    let mut fpc_result = fpc_ctx.into_execution_result();
    fpc_result.nested_results.push(fee_transfer_result);

    let transfer_result = transfer_ctx.into_execution_result();

    let mut entrypoint_result = entrypoint_ctx.into_execution_result();
    entrypoint_result.nested_results.push(fpc_result);
    entrypoint_result.nested_results.push(transfer_result);

    entrypoint_result
}

/// Parameters for a token transfer workload.
pub struct TransferParams<D: Digest> {
    // Schnorr signature for account entrypoint verification
    pub pubkey_x: D,
    pub pubkey_y: D,
    pub signature: [u8; 64],
    // Fee payment
    pub fee_args_hash: D,
    pub fee_calldata_hash: D,
    // Sender notes being consumed
    pub sender_value_0: D,
    pub sender_randomness_0: D,
    pub sender_value_1: D,
    pub sender_randomness_1: D,
    pub sender_secret_key: D,
    // Change note
    pub change_value: D,
    pub change_randomness: D,
    // Recipient note
    pub recipient_value: D,
    pub recipient_randomness: D,
}

impl<D: Digest> TransferParams<D> {
    /// Default test values with real Schnorr signature fixture.
    /// Generated with privkey=42 on Grumpkin, signing a 32-byte zero message.
    /// For NativePrecompiles (stub): verify_signature returns true regardless.
    /// For Bn254Precompiles/JoltPrecompiles: exercises real EC scalar muls.
    /// The signature may not verify (action_hash won't match the fixture message),
    /// but the EC operations are still performed and measured.
    pub fn default_test_values() -> Self {
        let mut b = [0u8; 32];
        let mut make = |tag: u8| -> D {
            b[0] = tag;
            D::from_bytes32(&b)
        };
        Self {
            pubkey_x: D::from_bytes32(&[16, 67, 221, 152, 75, 105, 123, 166, 196, 134, 27, 110, 51, 189, 139, 173, 98, 115, 133, 162, 89, 140, 127, 102, 152, 121, 102, 61, 139, 82, 26, 221]),
            pubkey_y: D::from_bytes32(&[18, 120, 4, 231, 229, 191, 231, 31, 27, 206, 224, 93, 35, 125, 170, 40, 52, 12, 144, 225, 189, 67, 157, 201, 120, 254, 43, 132, 204, 18, 125, 139]),
            signature: [27, 208, 88, 245, 107, 249, 162, 204, 145, 225, 201, 224, 35, 111, 201, 249, 187, 142, 79, 81, 150, 107, 255, 66, 188, 11, 48, 16, 4, 86, 232, 145, 42, 177, 185, 229, 69, 228, 23, 53, 167, 162, 111, 163, 32, 11, 30, 123, 58, 44, 183, 98, 42, 105, 185, 142, 254, 129, 254, 173, 103, 114, 30, 20],
            fee_args_hash: make(1),
            fee_calldata_hash: make(2),
            sender_value_0: make(3),
            sender_randomness_0: make(4),
            sender_value_1: make(5),
            sender_randomness_1: make(6),
            sender_secret_key: make(7),
            change_value: make(8),
            change_randomness: make(9),
            recipient_value: make(10),
            recipient_randomness: make(11),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::field::NativeDigest;
    use zkvm_data_types::precompiles::NativePrecompiles;
    use zkvm_kernel_logic::collect::collect_side_effects;

    #[test]
    fn token_transfer_structure_and_hashes() {
        let params = TransferParams::default_test_values();
        let result = token_transfer_with_fpc::<NativePrecompiles>(
            AztecAddress { inner: NativeDigest::from_u64(1) },
            AztecAddress { inner: NativeDigest::from_u64(2) },
            AztecAddress { inner: NativeDigest::from_u64(3) },
            AztecAddress { inner: NativeDigest::from_u64(4) },
            AztecAddress { inner: NativeDigest::from_u64(5) },
            &params,
        );

        // Call tree: entrypoint → [fpc, transfer]
        assert_eq!(result.nested_results.len(), 2);

        let collected = collect_side_effects(&result);
        // 2 note hashes (change + recipient), computed via Poseidon2
        assert_eq!(collected.scoped_note_hashes.len(), 2);
        // 3 nullifiers: 1 authwit + 2 balance notes
        assert_eq!(collected.scoped_nullifiers.len(), 3);
        // 1 public call enqueued
        assert_eq!(collected.public_call_requests.len(), 1);
        // 1 private log
        assert_eq!(collected.private_logs.len(), 1);

        // All hashes should be non-zero (computed, not pre-cooked)
        for nh in &collected.scoped_note_hashes {
            assert!(!nh.note_hash.value.is_zero(), "note hash should be a real computed value");
        }
        for n in &collected.scoped_nullifiers {
            assert!(!n.nullifier.value.is_zero(), "nullifier should be a real computed value");
        }
    }
}
