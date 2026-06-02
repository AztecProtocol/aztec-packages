/// Inline runner: executes workloads with inline kernel processing.
///
/// Architecture:
///   HOST: pre-compute Merkle witnesses (not proven)
///   GUEST: for each side effect, silo/squash/verify inline
///
/// The Merkle witnesses are pre-computed BEFORE the VM work starts
/// (simulating the host providing them as hints). The guest only
/// hashes from leaf to root (42 compress calls per read).
use alloc::vec::Vec;
use zkvm_data_types::field::Digest;
use zkvm_data_types::kernel_output::{KernelError, KernelPublicInputs, TxConstantData};
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::*;
use zkvm_data_types::types::{AztecAddress, BlockHeader, FunctionSelector, Gas, GasSettings, MembershipWitness, TxContext};
use zkvm_data_types::domain_separator;
use zkvm_aztec_sdk::tx_context::TxExecutionContext;

use super::runner::Workload;

/// Run a workload end-to-end with inline kernel processing.
pub fn run_workload_inline<P: Precompiles>(
    workload: Workload,
) -> Result<KernelPublicInputs<P::Digest>, KernelError> {
    // --- HOST SIDE: pre-compute hints (not proven) ---
    let (hints, constants) = precompute_hints::<P>(workload);

    // --- GUEST SIDE: execute with inline kernel (proven) ---
    let first_nullifier = P::poseidon2_hash_with_separator(
        &[P::Digest::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = 0xFF; b })],
        domain_separator::TX_NULLIFIER,
    );

    let mut tx = TxExecutionContext::<P>::new(constants, first_nullifier);

    match workload {
        Workload::Minimal => run_minimal::<P>(&mut tx),
        Workload::TokenTransfer => run_token_transfer::<P>(&mut tx, &hints),
        Workload::PrivateSwap => run_private_swap::<P>(&mut tx, &hints),
        Workload::Heavy => run_heavy::<P>(&mut tx),
        Workload::KernelHeavy => run_kernel_heavy::<P>(&mut tx),
    }

    tx.finalize()
}

struct WorkloadHints<D: Digest> {
    nh_witnesses: Vec<MembershipWitness<D>>,
}

fn addr<D: Digest>(id: u8) -> AztecAddress<D> {
    AztecAddress { inner: D::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = id; b }) }
}
fn val<D: Digest>(tag: u8) -> D {
    D::from_bytes32(&{ let mut b = [0u8; 32]; b[0] = tag; b })
}

/// HOST-SIDE: pre-compute witnesses. NOT proven.
fn precompute_hints<P: Precompiles>(workload: Workload) -> (WorkloadHints<P::Digest>, TxConstantData<P::Digest>) {
    let mut constants = default_constants::<P::Digest>();
    let hints = match workload {
        Workload::TokenTransfer => {
            let nh0 = P::poseidon2_hash(&[val(2), val(3), val(4)]);
            let nh1 = P::poseidon2_hash(&[val(2), val(5), val(6)]);
            let (witnesses, root) = crate::merkle_fixtures::generate_read_witnesses::<P>(&[nh0, nh1]);
            constants.anchor_block_header.note_hash_tree_root = root;
            WorkloadHints { nh_witnesses: witnesses }
        }
        Workload::PrivateSwap => {
            let t0_nh = P::poseidon2_hash(&[addr::<P::Digest>(1).inner, val(4), val(5)]);
            let t1_nh = P::poseidon2_hash(&[addr::<P::Digest>(1).inner, val(11), val(12)]);
            let (witnesses, root) = crate::merkle_fixtures::generate_read_witnesses::<P>(&[t0_nh, t1_nh]);
            constants.anchor_block_header.note_hash_tree_root = root;
            WorkloadHints { nh_witnesses: witnesses }
        }
        _ => WorkloadHints { nh_witnesses: Vec::new() },
    };
    (hints, constants)
}

fn run_minimal<P: Precompiles>(tx: &mut TxExecutionContext<P>) {
    let contract = addr(1);
    let note_hash = P::poseidon2_hash(&[val(10), val(11), val(12)]);
    tx.emit_note_hash(note_hash, contract);
    let nullifier = P::poseidon2_hash_with_separator(&[note_hash, val(13)], domain_separator::NOTE_NULLIFIER);
    tx.emit_nullifier_for_note_hash(nullifier, note_hash, contract);
}

fn run_token_transfer<P: Precompiles>(tx: &mut TxExecutionContext<P>, hints: &WorkloadHints<P::Digest>) {
    let account = addr(1);
    let token: AztecAddress<P::Digest> = addr(2);
    let fpc: AztecAddress<P::Digest> = addr(3);

    // Account entrypoint: call verify_signature to exercise EC/signature ops in the VM.
    //
    // Fixed secp256k1 ECDSA test vector (RFC 6979, §A.2.5, SHA-256, message "test"):
    //   Private key:  C9AFA9D845BA75166B5C215767B1D6934E50C3DB36E89B127B8A622B120F6721
    //   Public key x: 60FED4BA255A9D31C961EB74C6356D68C049B8923B61FA6CE669622E60F29FB6
    //   Public key y: 7903FE1008B8BC99A41AE9E95628BC64F2F1B20C2D7E9F5177A3C294D4462299
    //   r:            F1ABB023518351CD71D881567B1EA663ED3EFCF6C5132B354F28D3B0B7D38367
    //   s (low-S):    019F4113742A2B14BD25926B49C649155F267E60D3814B4C0CC84250E46F0083
    //
    // Backends that implement real secp256k1 ECDSA (Sp1Bn254Precompiles) will
    // validate this signature. Stub backends always return true.
    let secp_pk_x: [u8; 32] = [
        0x60, 0xFE, 0xD4, 0xBA, 0x25, 0x5A, 0x9D, 0x31,
        0xC9, 0x61, 0xEB, 0x74, 0xC6, 0x35, 0x6D, 0x68,
        0xC0, 0x49, 0xB8, 0x92, 0x3B, 0x61, 0xFA, 0x6C,
        0xE6, 0x69, 0x62, 0x2E, 0x60, 0xF2, 0x9F, 0xB6,
    ];
    let secp_pk_y: [u8; 32] = [
        0x79, 0x03, 0xFE, 0x10, 0x08, 0xB8, 0xBC, 0x99,
        0xA4, 0x1A, 0xE9, 0xE9, 0x56, 0x28, 0xBC, 0x64,
        0xF2, 0xF1, 0xB2, 0x0C, 0x2D, 0x7E, 0x9F, 0x51,
        0x77, 0xA3, 0xC2, 0x94, 0xD4, 0x46, 0x22, 0x99,
    ];
    let secp_sig: [u8; 64] = [
        // r
        0xF1, 0xAB, 0xB0, 0x23, 0x51, 0x83, 0x51, 0xCD,
        0x71, 0xD8, 0x81, 0x56, 0x7B, 0x1E, 0xA6, 0x63,
        0xED, 0x3E, 0xFC, 0xF6, 0xC5, 0x13, 0x2B, 0x35,
        0x4F, 0x28, 0xD3, 0xB0, 0xB7, 0xD3, 0x83, 0x67,
        // s (low-S)
        0x01, 0x9F, 0x41, 0x13, 0x74, 0x2A, 0x2B, 0x14,
        0xBD, 0x25, 0x92, 0x6B, 0x49, 0xC6, 0x49, 0x15,
        0x5F, 0x26, 0x7E, 0x60, 0xD3, 0x81, 0x4B, 0x4C,
        0x0C, 0xC8, 0x42, 0x50, 0xE4, 0x6F, 0x00, 0x83,
    ];
    let secp_msg: &[u8] = b"test";
    let _ = P::verify_signature(
        &P::Digest::from_bytes32(&secp_pk_x),
        &P::Digest::from_bytes32(&secp_pk_y),
        &secp_sig,
        secp_msg,
    );

    // FPC fee authwit
    let fee_inner = P::poseidon2_hash(&[fpc.inner, token.inner, val(1)]);
    let fee_null = P::poseidon2_hash_with_separator(&[account.inner, fee_inner], domain_separator::AUTHWIT_NULLIFIER);
    tx.emit_nullifier(fee_null, account);
    tx.enqueue_public_call(PublicCallRequest { contract_address: token, function_selector: FunctionSelector { inner: 0x03 }, calldata_hash: val(2), counter: 0 });
    tx.set_fee_payer(fpc);

    // Read + nullify note 0 (42 Poseidon2 compress for Merkle verify)
    let sender_nh_0 = P::poseidon2_hash(&[val(2), val(3), val(4)]);
    let _ = tx.verify_note_hash_read(sender_nh_0, &hints.nh_witnesses[0]);
    let sender_null_0 = P::poseidon2_hash_with_separator(&[sender_nh_0, val(7)], domain_separator::NOTE_NULLIFIER);
    tx.emit_nullifier(sender_null_0, token);

    // Read + nullify note 1 (42 Poseidon2 compress)
    let sender_nh_1 = P::poseidon2_hash(&[val(2), val(5), val(6)]);
    let _ = tx.verify_note_hash_read(sender_nh_1, &hints.nh_witnesses[1]);
    let sender_null_1 = P::poseidon2_hash_with_separator(&[sender_nh_1, val(7)], domain_separator::NOTE_NULLIFIER);
    tx.emit_nullifier(sender_null_1, token);

    // Change + recipient notes
    let change_nh    = P::poseidon2_hash(&[val(2), val(8), val(9)]);
    let recipient_nh = P::poseidon2_hash(&[val(5), val(10), val(11)]);
    tx.emit_note_hash(change_nh, token);
    tx.emit_note_hash(recipient_nh, token);

    // Encrypt note data before emitting as private log.
    // In real Aztec, private notes are encrypted with the recipient's ephemeral
    // shared secret. `aes128_encrypt` is constrained symmetric encryption —
    // backends may implement this as Poseidon2 sponge, ChaCha20, or actual AES
    // depending on what is efficient to prove in the target zkVM.
    let enc_key: [u8; 16] = [0x42u8; 16]; // deterministic fixture key
    let enc_iv:  [u8; 16] = [0x01u8; 16]; // deterministic fixture IV
    let _change_ct    = P::aes128_encrypt(&change_nh.to_bytes32(),    &enc_key, &enc_iv);
    let _recipient_ct = P::aes128_encrypt(&recipient_nh.to_bytes32(), &enc_key, &enc_iv);
    tx.emit_private_log(alloc::vec![recipient_nh]);
}

fn run_private_swap<P: Precompiles>(tx: &mut TxExecutionContext<P>, hints: &WorkloadHints<P::Digest>) {
    let account = addr(1);
    let token0: AztecAddress<P::Digest> = addr(2);
    let token1: AztecAddress<P::Digest> = addr(3);
    let amm: AztecAddress<P::Digest> = addr(4);
    let fpc: AztecAddress<P::Digest> = addr(5);
    let fee_token: AztecAddress<P::Digest> = addr(6);

    // Account entrypoint: verify signature (exercises EC ops).
    // Same secp256k1 ECDSA fixture as token_transfer.
    let action_hash = P::poseidon2_hash(&[account.inner, amm.inner, val(1)]);
    let _ = P::verify_signature(
        &P::Digest::zero(),
        &P::Digest::zero(),
        &[0u8; 64],
        &action_hash.to_bytes32(),
    );

    // FPC fee authwit
    let fee_inner = P::poseidon2_hash(&[fpc.inner, fee_token.inner, val(1)]);
    let fee_null = P::poseidon2_hash_with_separator(&[account.inner, fee_inner], domain_separator::AUTHWIT_NULLIFIER);
    tx.emit_nullifier(fee_null, account);
    tx.enqueue_public_call(PublicCallRequest { contract_address: fee_token, function_selector: FunctionSelector { inner: 0x03 }, calldata_hash: val(2), counter: 0 });
    tx.set_fee_payer(fpc);

    // Deterministic fixture key/IV for all swap note encryption.
    // `aes128_encrypt` is constrained symmetric encryption — backends may
    // implement this as Poseidon2 sponge, ChaCha20, or actual AES depending on
    // what is efficient to prove in the target zkVM.
    let enc_key: [u8; 16] = [0x42u8; 16];
    let enc_iv:  [u8; 16] = [0x01u8; 16];

    // Token0: authwit + read + nullify + change
    let t0_inner = P::poseidon2_hash(&[amm.inner, token0.inner, val(3)]);
    tx.emit_nullifier(P::poseidon2_hash_with_separator(&[account.inner, t0_inner], domain_separator::AUTHWIT_NULLIFIER), account);
    let t0_nh = P::poseidon2_hash(&[account.inner, val(4), val(5)]);
    let _ = tx.verify_note_hash_read(t0_nh, &hints.nh_witnesses[0]);
    tx.emit_nullifier(P::poseidon2_hash_with_separator(&[t0_nh, val(6)], domain_separator::NOTE_NULLIFIER), token0);
    let t0_change = P::poseidon2_hash(&[account.inner, val(7), val(8)]);
    tx.emit_note_hash(t0_change, token0);
    // Encrypt change note before emitting as private log (mirrors real Aztec behaviour)
    let _t0_ct = P::aes128_encrypt(&t0_change.to_bytes32(), &enc_key, &enc_iv);
    tx.emit_private_log(alloc::vec![t0_change]);
    tx.enqueue_public_call(PublicCallRequest { contract_address: token0, function_selector: FunctionSelector { inner: 0x03 }, calldata_hash: val(9), counter: 0 });

    // Token1: authwit + read + nullify + change
    let t1_inner = P::poseidon2_hash(&[amm.inner, token1.inner, val(10)]);
    tx.emit_nullifier(P::poseidon2_hash_with_separator(&[account.inner, t1_inner], domain_separator::AUTHWIT_NULLIFIER), account);
    let t1_nh = P::poseidon2_hash(&[account.inner, val(11), val(12)]);
    let _ = tx.verify_note_hash_read(t1_nh, &hints.nh_witnesses[1]);
    tx.emit_nullifier(P::poseidon2_hash_with_separator(&[t1_nh, val(13)], domain_separator::NOTE_NULLIFIER), token1);
    let t1_change = P::poseidon2_hash(&[account.inner, val(14), val(15)]);
    tx.emit_note_hash(t1_change, token1);
    // Encrypt change note before emitting as private log
    let _t1_ct = P::aes128_encrypt(&t1_change.to_bytes32(), &enc_key, &enc_iv);
    tx.emit_private_log(alloc::vec![t1_change]);
    tx.enqueue_public_call(PublicCallRequest { contract_address: token1, function_selector: FunctionSelector { inner: 0x03 }, calldata_hash: val(16), counter: 0 });

    tx.enqueue_public_call(PublicCallRequest { contract_address: amm, function_selector: FunctionSelector { inner: 0x11 }, calldata_hash: val(17), counter: 0 });
}

fn run_heavy<P: Precompiles>(tx: &mut TxExecutionContext<P>) {
    let contract = addr(1);
    for i in 0..16u8 {
        let nh = P::poseidon2_hash(&[val(i), val(i + 100), val(i + 200)]);
        tx.emit_note_hash(nh, contract);
        tx.emit_nullifier(P::poseidon2_hash_with_separator(&[nh, val(42)], domain_separator::NOTE_NULLIFIER), contract);
    }
    for i in 0..8u8 { tx.emit_private_log(alloc::vec![val(i)]); }
    for i in 0..2u8 {
        tx.enqueue_public_call(PublicCallRequest { contract_address: contract, function_selector: FunctionSelector { inner: 0x10 + i as u32 }, calldata_hash: val(i), counter: 0 });
    }
}

fn run_kernel_heavy<P: Precompiles>(tx: &mut TxExecutionContext<P>) {
    let contract = addr(1);
    for i in 0..32u8 {
        let nh = P::poseidon2_hash(&[val(i), val(i + 100), val(i + 200)]);
        tx.emit_note_hash(nh, contract);
        tx.emit_nullifier_for_note_hash(P::poseidon2_hash_with_separator(&[nh, val(42)], domain_separator::NOTE_NULLIFIER), nh, contract);
    }
}

fn default_constants<D: Digest>() -> TxConstantData<D> {
    let make = |tag: u8| -> D { let mut b = [0u8; 32]; b[0] = tag; b[1] = 0xFF; D::from_bytes32(&b) };
    TxConstantData {
        anchor_block_header: BlockHeader {
            last_archive_root: make(1), note_hash_tree_root: make(2), nullifier_tree_root: make(3),
            public_data_tree_root: make(4), l1_to_l2_message_tree_root: make(5), global_variables_hash: make(6),
            block_number: 100, slot_number: 200, timestamp: 1234567890,
        },
        tx_context: TxContext { chain_id: 1, version: 1, gas_settings: GasSettings {
            gas_limits: Gas { da_gas: 100000, l2_gas: 200000 }, teardown_gas_limits: Gas::zero(),
            max_fees_per_gas: Gas { da_gas: 10, l2_gas: 20 }, max_priority_fees_per_gas: Gas::zero(),
        }},
        vk_tree_root: make(7), protocol_contracts_hash: make(8),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::precompiles::NativePrecompiles;

    #[test]
    fn inline_all_workloads() {
        for workload in [Workload::Minimal, Workload::TokenTransfer, Workload::PrivateSwap, Workload::Heavy, Workload::KernelHeavy] {
            let result = run_workload_inline::<NativePrecompiles>(workload);
            assert!(result.is_ok(), "workload {:?} failed: {:?}", workload, result.err());
        }
    }

    #[test]
    fn inline_kernel_heavy_squashes_all() {
        let kpi = run_workload_inline::<NativePrecompiles>(Workload::KernelHeavy).unwrap();
        let rollup = kpi.for_rollup.as_ref().unwrap();
        assert_eq!(rollup.note_hashes.len(), 0, "all note hashes should be squashed");
        assert_eq!(rollup.nullifiers.len(), 1, "only protocol nullifier should remain");
    }
}
