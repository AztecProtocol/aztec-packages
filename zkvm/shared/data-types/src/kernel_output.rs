use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

use crate::field::Digest;
use crate::types::{AztecAddress, BlockHeader, Gas, TxContext};
use crate::side_effects::{PublicCallRequest, ScopedL2ToL1Message, ScopedLogHash};

/// The final output of kernel processing. This is what the zkVM proof commits
/// to as public outputs. Must match the format that the rollup circuits expect.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct KernelPublicInputs<D: Digest> {
    pub constants: TxConstantData<D>,
    pub gas_used: Gas,
    pub fee_payer: AztecAddress<D>,
    pub expiration_timestamp: u64,
    /// Present for private-only txs (no public calls).
    pub for_rollup: Option<PrivateToRollupAccumulatedData<D>>,
    /// Present for txs with public calls.
    pub for_public: Option<PartialPrivateTailPublicInputsForPublic<D>>,
}

/// Constant data for the transaction.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct TxConstantData<D: Digest> {
    pub anchor_block_header: BlockHeader<D>,
    pub tx_context: TxContext,
    pub vk_tree_root: D,
    pub protocol_contracts_hash: D,
}

/// Accumulated data for a private-only tx (goes directly to rollup).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct PrivateToRollupAccumulatedData<D: Digest> {
    /// Unique siloed note hashes (after squashing, siloing, and uniquification).
    pub note_hashes: Vec<D>,
    /// Siloed nullifiers (after squashing and siloing).
    pub nullifiers: Vec<D>,
    pub l2_to_l1_msgs: Vec<ScopedL2ToL1Message<D>>,
    pub private_logs: Vec<Vec<D>>,
    pub contract_class_log_hashes: Vec<ScopedLogHash<D>>,
}

/// Accumulated data for a tx with public calls (split by revertibility).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct PartialPrivateTailPublicInputsForPublic<D: Digest> {
    pub non_revertible_accumulated_data: PrivateToPublicAccumulatedData<D>,
    pub revertible_accumulated_data: PrivateToPublicAccumulatedData<D>,
    pub public_teardown_call_request: Option<PublicCallRequest<D>>,
}

/// Side effects bound for the public execution phase, split by revertibility.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct PrivateToPublicAccumulatedData<D: Digest> {
    pub note_hashes: Vec<D>,
    pub nullifiers: Vec<D>,
    pub l2_to_l1_msgs: Vec<ScopedL2ToL1Message<D>>,
    pub private_logs: Vec<Vec<D>>,
    pub contract_class_log_hashes: Vec<ScopedLogHash<D>>,
    pub public_call_requests: Vec<PublicCallRequest<D>>,
}

/// Errors that can occur during kernel processing.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum KernelError {
    /// A transient squash pair is invalid.
    InvalidSquashPair { note_hash_index: u32, nullifier_index: u32, reason: &'static str },
    /// A Merkle witness verification failed.
    InvalidMerkleWitness { request_index: u32 },
    /// Fee payer set in multiple calls.
    MultipleFeePayersDetected,
    /// Teardown call request set in multiple calls.
    MultipleTeardownCallsDetected,
    /// An internal consistency check failed.
    InternalError(&'static str),
}
