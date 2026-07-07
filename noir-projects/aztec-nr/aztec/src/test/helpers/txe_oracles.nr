use crate::{
    context::inputs::PrivateContextInputs,
    event::EventSelector,
    messages::encoding::MESSAGE_CIPHERTEXT_LEN,
    test::helpers::{tagging_secret_strategy::TaggingSecretStrategy, utils::TestAccount},
};

use crate::protocol::{
    abis::{function_selector::FunctionSelector, gas_settings::GasSettings},
    address::{AztecAddress, EthAddress},
    constants::{
        CONTRACT_INSTANCE_LENGTH, GAS_SETTINGS_LENGTH, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    contract_instance::ContractInstance,
    traits::{Deserialize, Serialize, ToField},
};

/// The TXE oracle version constants are used to check that the oracle interface used for tests is in sync between
/// TXE and Aztec.nr. This is separate from the contract oracle version in
/// [`oracle::version`](crate::oracle::version), which covers oracles used during contract execution by PXE.
///
/// The TypeScript counterparts are in `yarn-project/txe/src/txe_oracle_version.ts`.
pub global TXE_ORACLE_VERSION_MAJOR: Field = 3;
pub global TXE_ORACLE_VERSION_MINOR: Field = 0;

/// Asserts that the TXE oracle interface version is compatible.
pub unconstrained fn assert_compatible_txe_oracle_version() {
    assert_compatible_txe_oracle_version_oracle_call(TXE_ORACLE_VERSION_MAJOR, TXE_ORACLE_VERSION_MINOR);
}

#[oracle(aztec_txe_assertCompatibleOracleVersion)]
unconstrained fn assert_compatible_txe_oracle_version_oracle_call(major: Field, minor: Field) {}

/// Upper bound on the number of raw offchain effects the TXE test environment will surface
/// to Noir in a single `get_last_call_offchain_effects` query.
pub(crate) global MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY: u32 = 64;

/// Maximum number of fields in a single raw offchain effect payload.
pub(crate) global MAX_OFFCHAIN_EFFECT_LEN: u32 = 2 + MESSAGE_CIPHERTEXT_LEN;

global MAX_PRIVATE_EVENTS_PER_TXE_QUERY: u32 = 5;
global MAX_EVENT_SERIALIZATION_LENGTH: u32 = 10;

pub unconstrained fn deploy<let M: u32, let N: u32, let P: u32>(
    path: str<N>,
    initializer: str<P>,
    args: [Field; M],
    secret: Field,
    salt: Field,
    deployer: AztecAddress,
) -> ContractInstance {
    let instance_fields = deploy_oracle(path, initializer, args, secret, salt, deployer);
    ContractInstance::deserialize(instance_fields)
}

pub unconstrained fn private_call_new_flow<let M: u32, let N: u32, let S: u32, let T: u32>(
    from: Option<AztecAddress>,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
    args_hash: Field,
    is_static_call: bool,
    additional_scopes: [AztecAddress; S],
    authorized_utility_call_targets: [AztecAddress; T],
    gas_settings: GasSettings,
) -> [Field; N] {
    private_call_new_flow_oracle(
        from,
        contract_address,
        function_selector,
        args,
        args_hash,
        is_static_call,
        additional_scopes,
        authorized_utility_call_targets,
        gas_settings.serialize(),
    )
}

pub unconstrained fn public_call_new_flow<let M: u32, let N: u32>(
    from: Option<AztecAddress>,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
    is_static_call: bool,
    gas_settings: GasSettings,
) -> [Field; N] {
    let calldata = [function_selector.to_field()].concat(args);

    public_call_new_flow_oracle(
        from,
        contract_address,
        calldata,
        is_static_call,
        gas_settings.serialize(),
    )
}

pub unconstrained fn set_private_txe_context(
    contract_address: Option<AztecAddress>,
    anchor_block_number: Option<u32>,
    gas_settings: GasSettings,
) -> PrivateContextInputs {
    set_private_txe_context_oracle(
        contract_address,
        anchor_block_number,
        gas_settings.serialize(),
    )
}

pub unconstrained fn execute_utility_function<let M: u32, let N: u32, let T: u32>(
    from: Option<AztecAddress>,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
    authorized_utility_call_targets: [AztecAddress; T],
) -> [Field; N] {
    execute_utility_function_oracle(
        from,
        contract_address,
        function_selector,
        args,
        authorized_utility_call_targets,
    )
}

#[oracle(aztec_txe_getNextBlockNumber)]
pub unconstrained fn get_next_block_number() -> u32 {}

#[oracle(aztec_txe_getNextBlockTimestamp)]
pub unconstrained fn get_next_block_timestamp() -> u64 {}

#[oracle(aztec_txe_getLastBlockTimestamp)]
pub unconstrained fn get_last_block_timestamp() -> u64 {}

/// Note hashes emitted by a single transaction, as surfaced by [`get_last_tx_effects`].
pub type TxNoteHashes = BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>;

/// Nullifiers emitted by a single transaction, as surfaced by [`get_last_tx_effects`].
pub type TxNullifiers = BoundedVec<Field, MAX_NULLIFIERS_PER_TX>;

/// A single private log's `log_data` as surfaced by [`get_last_tx_effects`]: the first field is
/// the kernel-siloed tag and the remainder is the ciphertext payload.
pub type TxPrivateLog = BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>;

/// Private logs emitted by a single transaction, in emission order, as surfaced by
/// [`get_last_tx_effects`].
pub type TxPrivateLogs = BoundedVec<TxPrivateLog, MAX_PRIVATE_LOGS_PER_TX>;

/// The side effects of a single transaction, as surfaced by [`get_last_tx_effects`].
pub struct TxEffects {
    pub tx_hash: Field,
    pub note_hashes: TxNoteHashes,
    pub nullifiers: TxNullifiers,
    pub private_logs: TxPrivateLogs,
}

/// Returns the effects of the last transaction included by the TXE.
pub unconstrained fn get_last_tx_effects() -> TxEffects {
    let (tx_hash, note_hashes, nullifiers, raw_log_storage, log_lengths, log_count) = get_last_tx_effects_oracle();

    let mut private_logs = BoundedVec::new();
    for i in 0..log_count {
        private_logs.push(BoundedVec::from_parts(raw_log_storage[i], log_lengths[i]));
    }

    TxEffects { tx_hash, note_hashes, nullifiers, private_logs }
}

#[oracle(aztec_txe_getLastTxEffects)]
unconstrained fn get_last_tx_effects_oracle() -> (Field, TxNoteHashes, TxNullifiers, [[Field; PRIVATE_LOG_SIZE_IN_FIELDS]; MAX_PRIVATE_LOGS_PER_TX], [u32; MAX_PRIVATE_LOGS_PER_TX], u32) {}

/// Returns the raw offchain effect payloads emitted by the last top-level call into TXE.
/// Each effect is a variable-length field array (e.g. offchain messages have a different size
/// than authwit authorization requests).
pub unconstrained fn get_last_call_offchain_effects() -> BoundedVec<BoundedVec<Field, MAX_OFFCHAIN_EFFECT_LEN>, MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY> {
    let (raw_storage, effect_lengths, count) = get_last_call_offchain_effects_oracle();

    let mut effects = BoundedVec::new();
    for i in 0..count {
        effects.push(BoundedVec::from_parts(raw_storage[i], effect_lengths[i]));
    }
    effects
}

#[oracle(aztec_txe_getLastCallOffchainEffects)]
unconstrained fn get_last_call_offchain_effects_oracle() -> ([[Field; MAX_OFFCHAIN_EFFECT_LEN]; MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY], [u32; MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY], u32) {}

/// The context of the last top-level call into TXE, as captured by the call executor. Refreshed on
/// every top-level call.
pub struct TXECallContext {
    /// Tx hash of the top-level call, or `None` if the call was tx-less (`execute_utility`, context
    /// setters, etc.).
    pub tx_hash: Option<Field>,
    /// Anchor block timestamp captured at the *start* of the call. Note: this is not the timestamp
    /// of the block where a transaction produced by this call is included, which does not exist at
    /// the moment TXE runs the call.
    pub anchor_block_timestamp: u64,
}

/// Returns the context of the last top-level call into TXE. See [`TXECallContext`].
#[oracle(aztec_txe_getLastCallContext)]
pub unconstrained fn get_last_call_context() -> TXECallContext {}

#[oracle(aztec_txe_getDefaultAddress)]
pub unconstrained fn get_default_address() -> AztecAddress {}

// experimental
pub(crate) unconstrained fn get_private_events(
    selector: EventSelector,
    contract_address: AztecAddress,
    scope: AztecAddress,
) -> BoundedVec<BoundedVec<Field, MAX_EVENT_SERIALIZATION_LENGTH>, MAX_PRIVATE_EVENTS_PER_TXE_QUERY> {
    // This is a workaround as Noir does not currently let us return nested structs with arrays. We instead return a
    // raw multidimensional array in get_private_events_oracle and create the BoundedVecs here.

    let (raw_array_storage, event_lengths, query_length) = get_private_events_oracle(selector, contract_address, scope);

    let mut events = BoundedVec::new();
    for i in 0..query_length {
        events.push(BoundedVec::from_parts(raw_array_storage[i], event_lengths[i]));
    }

    events
}

#[oracle(aztec_txe_getPrivateEvents)]
unconstrained fn get_private_events_oracle(
    selector: EventSelector,
    contract_address: AztecAddress,
    scope: AztecAddress,
    ) -> ([[Field; MAX_EVENT_SERIALIZATION_LENGTH]; MAX_PRIVATE_EVENTS_PER_TXE_QUERY], [u32; MAX_PRIVATE_EVENTS_PER_TXE_QUERY], u32) {}

#[oracle(aztec_txe_advanceBlocksBy)]
pub unconstrained fn advance_blocks_by(blocks: u32) {}

#[oracle(aztec_txe_advanceTimestampBy)]
pub unconstrained fn advance_timestamp_by(duration: u64) {}

#[oracle(aztec_txe_deploy)]
pub unconstrained fn deploy_oracle<let N: u32, let P: u32>(
    path: str<N>,
    initializer: str<P>,
    args: [Field],
    secret: Field,
    salt: Field,
    deployer: AztecAddress,
) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

#[oracle(aztec_txe_createAccount)]
pub unconstrained fn create_account(secret: Field) -> TestAccount {}

#[oracle(aztec_txe_addAccount)]
pub unconstrained fn add_account(secret: Field) -> TestAccount {}

#[oracle(aztec_txe_addAuthWitness)]
pub unconstrained fn add_authwit(address: AztecAddress, message_hash: Field) {}

#[oracle(aztec_txe_sendL1ToL2Message)]
pub unconstrained fn send_l1_to_l2_message(
    content: Field,
    secret_hash: Field,
    sender: EthAddress,
    recipient: AztecAddress,
) -> Field {}

#[oracle(aztec_txe_setTaggingSecretStrategies)]
pub unconstrained fn set_tagging_secret_strategies(
    unconstrained_strategy: Option<TaggingSecretStrategy>,
    constrained_strategy: Option<TaggingSecretStrategy>,
) {}

#[oracle(aztec_txe_privateCallNewFlow)]
unconstrained fn private_call_new_flow_oracle<let M: u32, let N: u32, let S: u32, let T: u32>(
    _from: Option<AztecAddress>,
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field; M],
    _args_hash: Field,
    _is_static_call: bool,
    _additional_scopes: [AztecAddress; S],
    _authorized_utility_call_targets: [AztecAddress; T],
    _gas_settings: [Field; GAS_SETTINGS_LENGTH],
) -> [Field; N] {}

#[oracle(aztec_txe_publicCallNewFlow)]
unconstrained fn public_call_new_flow_oracle<let M: u32, let N: u32>(
    from: Option<AztecAddress>,
    contract_address: AztecAddress,
    calldata: [Field; M],
    is_static_call: bool,
    gas_settings: [Field; GAS_SETTINGS_LENGTH],
) -> [Field; N] {}

#[oracle(aztec_txe_executeUtilityFunction)]
unconstrained fn execute_utility_function_oracle<let M: u32, let N: u32, let T: u32>(
    from: Option<AztecAddress>,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
    authorized_utility_call_targets: [AztecAddress; T],
) -> [Field; N] {}

#[oracle(aztec_txe_setTopLevelTXEContext)]
pub unconstrained fn set_top_level_txe_context() {}

#[oracle(aztec_txe_setPrivateTXEContext)]
unconstrained fn set_private_txe_context_oracle(
    _contract_address: Option<AztecAddress>,
    _anchor_block_number: Option<u32>,
    _gas_settings: [Field; GAS_SETTINGS_LENGTH],
) -> PrivateContextInputs {}

#[oracle(aztec_txe_setPublicTXEContext)]
pub unconstrained fn set_public_txe_context(contract_address: Option<AztecAddress>) {}

#[oracle(aztec_txe_setUtilityTXEContext)]
pub unconstrained fn set_utility_txe_context(contract_address: Option<AztecAddress>) {}
