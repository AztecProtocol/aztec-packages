use alloc::vec::Vec;
use zkvm_data_types::field::Digest;
use zkvm_data_types::types::{AztecAddress, PublicKeys};

/// Trait for the oracle provider. During pre-flight, backed by live PXE calls.
/// During guest execution, backed by sequential reads from the TxExecutionBundle.
pub trait OracleProvider<D: Digest> {
    fn get_notes(&self, storage_slot: &D) -> Vec<Vec<D>>;
    fn get_auth_witness(&self, message_hash: &D) -> Vec<D>;
    fn get_public_keys(&self, address: &AztecAddress<D>) -> PublicKeys<D>;
    fn check_nullifier_exists(&self, nullifier: &D) -> bool;
    fn get_random_field(&self) -> D;
}
