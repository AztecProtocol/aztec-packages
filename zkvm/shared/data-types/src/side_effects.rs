use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

use crate::field::Digest;
use crate::types::{AztecAddress, EthAddress, FunctionSelector};

/// A note hash emitted by a private function.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct NoteHash<D: Digest> {
    pub value: D,
    pub counter: u32,
}

/// A note hash scoped to the contract that emitted it.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct ScopedNoteHash<D: Digest> {
    pub note_hash: NoteHash<D>,
    pub contract_address: AztecAddress<D>,
}

/// A nullifier emitted by a private function.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct Nullifier<D: Digest> {
    pub value: D,
    pub counter: u32,
    /// The note hash that this nullifier is nullifying (zero if not a note nullifier).
    pub nullified_note_hash: D,
}

/// A nullifier scoped to the contract that emitted it.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct ScopedNullifier<D: Digest> {
    pub nullifier: Nullifier<D>,
    pub contract_address: AztecAddress<D>,
}

/// A read request (note hash or nullifier membership check).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct ReadRequest<D: Digest> {
    pub value: D,
    pub counter: u32,
}

/// A read request scoped to a contract.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct ScopedReadRequest<D: Digest> {
    pub read_request: ReadRequest<D>,
    pub contract_address: AztecAddress<D>,
}

/// Private log data (encrypted log emitted from a private function).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct PrivateLogData<D: Digest> {
    pub fields: Vec<D>,
    pub emitted_length: u32,
    pub counter: u32,
    pub note_hash_counter: u32,
}

/// An L2-to-L1 message scoped to a contract.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct ScopedL2ToL1Message<D: Digest> {
    pub recipient: EthAddress,
    pub content: D,
    pub counter: u32,
    pub contract_address: AztecAddress<D>,
}

/// A log hash scoped to a contract (for contract class logs).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct ScopedLogHash<D: Digest> {
    pub value: D,
    pub counter: u32,
    pub length: u32,
    pub contract_address: AztecAddress<D>,
}

/// An enqueued public function call.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct PublicCallRequest<D: Digest> {
    pub contract_address: AztecAddress<D>,
    pub function_selector: FunctionSelector,
    pub calldata_hash: D,
    pub counter: u32,
}

/// A key validation request.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct KeyValidationRequest<D: Digest> {
    pub pk_m_hash: D,
    pub counter: u32,
}

/// Trait for types that carry a side-effect counter (for ordering/splitting).
pub trait HasCounter {
    fn counter(&self) -> u32;
}

impl<D: Digest> HasCounter for ScopedNoteHash<D> {
    fn counter(&self) -> u32 {
        self.note_hash.counter
    }
}

impl<D: Digest> HasCounter for ScopedNullifier<D> {
    fn counter(&self) -> u32 {
        self.nullifier.counter
    }
}

impl<D: Digest> HasCounter for PrivateLogData<D> {
    fn counter(&self) -> u32 {
        self.counter
    }
}

impl<D: Digest> HasCounter for ScopedL2ToL1Message<D> {
    fn counter(&self) -> u32 {
        self.counter
    }
}

impl<D: Digest> HasCounter for ScopedLogHash<D> {
    fn counter(&self) -> u32 {
        self.counter
    }
}

impl<D: Digest> HasCounter for PublicCallRequest<D> {
    fn counter(&self) -> u32 {
        self.counter
    }
}

/// The result of executing a single private function call.
/// This is the input to the kernel logic — analogous to PrivateCallExecutionResult in TS.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct ExecutionResult<D: Digest> {
    pub contract_address: AztecAddress<D>,
    pub function_selector: FunctionSelector,
    pub note_hashes: Vec<NoteHash<D>>,
    pub nullifiers: Vec<Nullifier<D>>,
    pub read_requests: Vec<ReadRequest<D>>,
    pub nullifier_read_requests: Vec<ReadRequest<D>>,
    pub private_logs: Vec<PrivateLogData<D>>,
    pub l2_to_l1_messages: Vec<ScopedL2ToL1Message<D>>,
    pub contract_class_log_hashes: Vec<ScopedLogHash<D>>,
    pub public_call_requests: Vec<PublicCallRequest<D>>,
    pub teardown_call_request: Option<PublicCallRequest<D>>,
    pub is_fee_payer: bool,
    pub expiration_timestamp: Option<u64>,
    /// Counter map: for each note hash counter, the counter of the nullifier
    /// that will nullify it (used for transient squash hint generation).
    pub note_hash_nullifier_counters: Vec<(u32, u32)>,
    /// Nested private function call results (depth-first).
    pub nested_results: Vec<ExecutionResult<D>>,
}

/// Collected side effects from walking the entire call tree.
/// Output of `collect_side_effects`, input to kernel processing.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct CollectedSideEffects<D: Digest> {
    pub scoped_note_hashes: Vec<ScopedNoteHash<D>>,
    pub scoped_nullifiers: Vec<ScopedNullifier<D>>,
    pub note_hash_read_requests: Vec<ScopedReadRequest<D>>,
    pub nullifier_read_requests: Vec<ScopedReadRequest<D>>,
    pub private_logs: Vec<PrivateLogData<D>>,
    pub l2_to_l1_messages: Vec<ScopedL2ToL1Message<D>>,
    pub contract_class_log_hashes: Vec<ScopedLogHash<D>>,
    pub public_call_requests: Vec<PublicCallRequest<D>>,
    pub teardown_call_request: Option<PublicCallRequest<D>>,
    pub fee_payer: AztecAddress<D>,
    pub expiration_timestamp: u64,
    /// Map from note_hash counter to nullifier counter (for transient squash).
    pub note_hash_nullifier_counters: Vec<(u32, u32)>,
}
