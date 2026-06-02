use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

use crate::field::Digest;

/// An Aztec L2 contract address. Wraps a Digest (hash of the contract's preimage).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct AztecAddress<D: Digest> {
    pub inner: D,
}

impl<D: Digest> AztecAddress<D> {
    pub fn zero() -> Self {
        Self { inner: D::zero() }
    }

    pub fn is_zero(&self) -> bool {
        self.inner.is_zero()
    }
}

/// An Ethereum L1 address (20 bytes).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash, Debug, Serialize, Deserialize)]
pub struct EthAddress {
    pub inner: [u8; 20],
}

impl EthAddress {
    pub fn zero() -> Self {
        Self { inner: [0u8; 20] }
    }
}

/// A 4-byte function selector.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash, Debug, Serialize, Deserialize)]
pub struct FunctionSelector {
    pub inner: u32,
}

/// Gas consumption (DA and L2 components).
#[derive(Clone, Copy, PartialEq, Eq, Default, Debug, Serialize, Deserialize)]
pub struct Gas {
    pub da_gas: u32,
    pub l2_gas: u32,
}

impl Gas {
    pub fn zero() -> Self {
        Self { da_gas: 0, l2_gas: 0 }
    }

    pub fn add(&self, other: &Gas) -> Gas {
        Gas {
            da_gas: self.da_gas.saturating_add(other.da_gas),
            l2_gas: self.l2_gas.saturating_add(other.l2_gas),
        }
    }
}

/// Merkle membership witness.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct MembershipWitness<D: Digest> {
    pub leaf_index: u64,
    pub sibling_path: Vec<D>,
}

/// Tx execution request — what the user submits.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct TxExecutionRequest<D: Digest> {
    pub origin: AztecAddress<D>,
    pub function_selector: FunctionSelector,
    pub args_hash: D,
    pub tx_context: TxContext,
}

/// Transaction context (gas settings, chain info).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct TxContext {
    pub chain_id: u64,
    pub version: u64,
    pub gas_settings: GasSettings,
}

/// Gas settings for a transaction.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct GasSettings {
    pub gas_limits: Gas,
    pub teardown_gas_limits: Gas,
    pub max_fees_per_gas: Gas,
    pub max_priority_fees_per_gas: Gas,
}

/// Block header — the anchor for tree roots.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct BlockHeader<D: Digest> {
    pub last_archive_root: D,
    pub note_hash_tree_root: D,
    pub nullifier_tree_root: D,
    pub public_data_tree_root: D,
    pub l1_to_l2_message_tree_root: D,
    pub global_variables_hash: D,
    pub block_number: u64,
    pub slot_number: u64,
    pub timestamp: u64,
}

/// Public keys associated with an account.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct PublicKeys<D: Digest> {
    pub npk_m: D,
    pub ivpk_m: D,
    pub ovpk_m: D,
    pub tpk_m: D,
}

/// A deployed contract instance.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(bound = "")]
pub struct ContractInstance<D: Digest> {
    pub address: AztecAddress<D>,
    pub contract_class_id: D,
    pub initialization_hash: D,
    pub deployer: AztecAddress<D>,
    pub public_keys: PublicKeys<D>,
}
