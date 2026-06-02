use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

use crate::field::Digest;
use crate::types::{AztecAddress, BlockHeader, FunctionSelector, MembershipWitness, TxExecutionRequest};

/// Everything the guest needs for one transaction, pre-packaged by the host.
/// Read from the zkVM input stream at the start of guest execution.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct TxExecutionBundle<D: Digest> {
    /// The tx request (entrypoint address, function selector, args).
    pub tx_request: TxExecutionRequest<D>,

    /// Block header the tx is anchored to (for tree root references).
    pub anchor_block_header: BlockHeader<D>,

    /// Bytecodes for each contract function called during execution,
    /// keyed by (contract_address, function_selector).
    pub function_bytecodes: Vec<FunctionBytecode<D>>,

    /// Oracle responses, pre-fetched by the host during pre-flight.
    /// The guest reads these sequentially as the interpreter re-executes.
    pub oracle_responses: Vec<OracleResponse<D>>,

    /// Kernel processing hints, pre-computed by the host.
    pub kernel_hints: KernelHints<D>,
}

/// Bytecode for a single contract function.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct FunctionBytecode<D: Digest> {
    pub contract_address: AztecAddress<D>,
    pub function_selector: FunctionSelector,
    pub bytecode: Vec<u8>,
}

/// A pre-fetched oracle response.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub enum OracleResponse<D: Digest> {
    /// Response to a get_notes query.
    Notes(Vec<NoteData<D>>),
    /// Response to a membership witness query.
    MembershipWitness(MembershipWitness<D>),
    /// Response to a get_auth_witness query.
    AuthWitness(Vec<D>),
    /// Response to a get_public_keys query.
    PublicKeys(crate::types::PublicKeys<D>),
    /// Response to a check_nullifier_exists query.
    NullifierExists(bool),
    /// Generic field data.
    Fields(Vec<D>),
}

/// A note returned by get_notes.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct NoteData<D: Digest> {
    pub storage_slot: D,
    pub note_hash: D,
    pub fields: Vec<D>,
    pub owner: AztecAddress<D>,
}

/// Hints from the host for the kernel's verification logic.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct KernelHints<D: Digest> {
    /// Pairs of (note_hash_index, nullifier_index) that cancel each other.
    pub transient_squash_pairs: Vec<TransientSquashPair>,

    /// Merkle membership witnesses for settled note hash read requests.
    pub note_hash_read_witnesses: Vec<MembershipWitness<D>>,

    /// Merkle membership witnesses for settled nullifier read requests.
    pub nullifier_read_witnesses: Vec<MembershipWitness<D>>,

    /// The min revertible side effect counter (determines the split point).
    pub min_revertible_counter: u32,

    /// For each note hash read request: how to validate it.
    pub note_hash_read_actions: Vec<ReadRequestAction>,

    /// For each nullifier read request: how to validate it.
    pub nullifier_read_actions: Vec<ReadRequestAction>,
}

/// Identifies a transient note hash / nullifier pair that cancels out.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct TransientSquashPair {
    pub note_hash_index: u32,
    pub nullifier_index: u32,
}

/// How the guest should validate a read request.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum ReadRequestAction {
    /// No validation needed (e.g., read of an empty value).
    Noop,
    /// The read was of a pending (transient) value in the current tx.
    ReadAsPending { pending_value_index: u32 },
    /// The read was of a settled value — verify via Merkle witness.
    ReadAsSettled { witness_index: u32 },
}
