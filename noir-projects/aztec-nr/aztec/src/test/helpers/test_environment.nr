use crate::protocol::{
    abis::{function_selector::FunctionSelector, gas::Gas, gas_fees::GasFees, gas_settings::GasSettings},
    address::{AztecAddress, EthAddress},
    constants::{MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT, MAX_PROCESSABLE_L2_GAS},
    traits::{Deserialize, Empty, FromField, Packable, Serialize},
};

use crate::{
    context::{
        PrivateCall, PrivateContext, PrivateStaticCall, PublicCall, PublicContext, PublicStaticCall, UtilityCall,
        UtilityContext,
    },
    event::{event_interface::EventInterface, EventMessage},
    hash::{compute_secret_hash, hash_args},
    messages::{
        delivery::OnchainDeliveryMode,
        discovery::{
            ComputeNoteHash, ComputeNoteNullifier, CustomMessageHandler, process_message::process_message_plaintext,
        },
        encoding::{MESSAGE_CIPHERTEXT_LEN, MESSAGE_PLAINTEXT_LEN},
        logs::{event::encode_private_event_message, note::encode_private_note_message},
        offchain_messages::OFFCHAIN_MESSAGE_IDENTIFIER,
        processing::{offchain::OffchainMessage, ResolvedTx, validate_and_store_enqueued_notes_and_events},
    },
    note::{note_interface::{NoteHash, NoteType}, NoteMessage},
    oracle::version::assert_compatible_oracle_version,
    test::helpers::{tagging_secret_strategy::TaggingSecretStrategy, txe_oracles, utils::ContractDeployment},
    utils::array::subarray,
};

mod test;

struct Counter {
    next_value: Field,
}

impl Counter {
    fn new() -> Self {
        Self { next_value: 0 }
    }

    fn new_with_offset(offset: Field) -> Self {
        Self { next_value: offset }
    }

    fn next(&mut self) -> Field {
        let ret = self.next_value;
        self.next_value += 1;
        ret
    }
}

/// This represents an Aztec test run, and contains all the methods utilized during one to interact with the network
/// and manipulate its state (e.g. create accounts, make contract calls, etc.). Each test is expected to have its own
/// instance of [`TestEnvironment`], as tests execute in parallel and so cannot share this object.
///
/// Most tests will begin by creating a [`TestEnvironment`] variable, and then make multiple calls to its different
/// methods. E.g.:
/// ```noir
/// #[test]
/// fn sample_test() {
///     let mut env = TestEnvironment::new();
///
///     // Create an account to call contracts from
///     let account = env.create_light_account();
///     // Deploy a compiled contract
///     let contract_addr = env.deploy("MyContract").without_initializer();
///
///     // Call a contract private function and get the return value
///     let result = env.private_call(account, MyContract::at(contract_addr).sample_private_function());
///     assert_eq(result, expected);
/// }
/// ```
pub struct TestEnvironment {
    // The secrets and salt to be used for light and contract account creation, as well as contract deployments. By
    // keeping track of the last used secret we can issue new ones automatically without requiring the user to provide
    // different ones.
    //
    // Additionally, having the secrets and salt be deterministic for each set of accounts and all concurrent tests
    // results in TXE being able to maximize cache usage and not have to recompute account addresses and contract
    // artifacts, which are relatively expensive operations.
    light_account_secret: Counter,
    contract_account_secret: Counter,
    contract_deployment_secret: Counter,
    contract_deployment_salt: Counter,
}

/// Configuration values for [`TestEnvironment::new_opts`]. Meant to be used by calling `new` and then chaining
/// methods setting each value, e.g.:
/// ```noir
/// let env = TestEnvironment::new_opts(
///     TestEnvironmentOptions::new().with_default_tag_secret_strategy(
///         MessageDelivery::onchain_unconstrained(),
///         TaggingSecretStrategy::non_interactive_handshake(),
///     ),
/// );
/// ```
pub struct TestEnvironmentOptions {
    default_unconstrained_tagging_secret_strategy: Option<TaggingSecretStrategy>,
    default_constrained_tagging_secret_strategy: Option<TaggingSecretStrategy>,
    authorize_all_utility_call_targets: bool,
}

impl TestEnvironmentOptions {
    /// Creates a new `TestEnvironmentOptions` with default values.
    pub fn new() -> Self {
        Self {
            default_unconstrained_tagging_secret_strategy: Option::none(),
            default_constrained_tagging_secret_strategy: Option::none(),
            authorize_all_utility_call_targets: false,
        }
    }

    /// Sets the default [`TaggingSecretStrategy`] the wallet reports for `mode` through the
    /// [`resolve_tagging_strategy`](crate::oracle::resolve_tagging_strategy) oracle, affecting message delivery in
    /// private executions that do not fix their own delivery derivation.
    ///
    /// If no strategy is set for either mode, the wallet hook is left unconfigured and the private execution
    /// environment applies its own default. A mode left unset while the other is configured falls back to the default
    /// [`TaggingSecretStrategy::non_interactive_handshake`], the strategy a PXE `resolveTaggingSecretStrategy` hook
    /// typically hardcodes for modes it does not customize.
    pub fn with_default_tag_secret_strategy<M>(&mut self, mode: M, strategy: TaggingSecretStrategy) -> Self
    where
        M: Into<OnchainDeliveryMode>,
    {
        if mode.into() == OnchainDeliveryMode::onchain_unconstrained() {
            self.default_unconstrained_tagging_secret_strategy = Option::some(strategy);
        } else {
            self.default_constrained_tagging_secret_strategy = Option::some(strategy);
        }
        *self
    }

    /// Sets `strategy` for both delivery modes: the equivalent of a PXE `resolveTaggingSecretStrategy` hook that
    /// ignores the request's mode. See
    /// [`with_default_tag_secret_strategy`](Self::with_default_tag_secret_strategy) to configure a single mode.
    pub fn with_default_tag_secret_strategy_all_modes(&mut self, strategy: TaggingSecretStrategy) -> Self {
        let _ = self.with_default_tag_secret_strategy(OnchainDeliveryMode::onchain_unconstrained(), strategy);
        self.with_default_tag_secret_strategy(OnchainDeliveryMode::onchain_constrained(), strategy)
    }

    /// Authorizes all cross-contract utility call targets for the entire test.
    ///
    /// Removes the need to list targets on each call via
    /// [`CallPrivateOptions::with_authorized_utility_call_targets`] and its siblings.
    ///
    /// By default, cross-contract utility calls are denied, mirroring a wallet that authorizes no such call. Use
    /// this in tests that do not care about utility call authorization.
    pub fn with_all_utility_call_targets_authorized(&mut self) -> Self {
        self.authorize_all_utility_call_targets = true;
        *self
    }
}

/// Configuration values for [`TestEnvironment::private_context_opts`]. Meant to be used by calling `new` and then
/// chaining methods setting each value, e.g.:
/// ```noir
/// env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(5), ...);
/// ```
pub struct PrivateContextOptions {
    contract_address: Option<AztecAddress>,
    anchor_block_number: Option<u32>,
    gas_limits: Option<Gas>,
    teardown_gas_limits: Option<Gas>,
    max_fees_per_gas: Option<GasFees>,
    max_priority_fees_per_gas: Option<GasFees>,
}

impl PrivateContextOptions {
    /// Creates a new `PrivateContextOptions` with default values, i.e. the same as if using
    /// [`TestEnvironment::private_context`] instead of [`TestEnvironment::private_context_opts`]. Use
    /// [`at_anchor_block_number`](PrivateContextOptions::at_anchor_block_number) and other methods to set the desired
    /// configuration values.
    pub fn new() -> Self {
        Self {
            contract_address: Option::none(),
            anchor_block_number: Option::none(),
            gas_limits: Option::none(),
            teardown_gas_limits: Option::none(),
            max_fees_per_gas: Option::none(),
            max_priority_fees_per_gas: Option::none(),
        }
    }

    /// Sets the desired anchor block number to base the private context in. Only past block numbers can be specified.
    ///
    /// If not set, defaults to the last block number.
    pub fn at_anchor_block_number(&mut self, anchor_block_number: u32) -> Self {
        self.anchor_block_number = Option::some(anchor_block_number);
        *self
    }

    /// Sets the contract address in which the private context will execute, which will affect note and nullifier
    /// siloing, storage access, etc.
    pub fn at_contract_address(&mut self, contract_address: AztecAddress) -> Self {
        self.contract_address = Option::some(contract_address);
        *self
    }

    /// Sets the gas limits for the transaction.
    ///
    /// If not set, defaults to the maximum the protocol allows.
    pub fn with_gas_limits(&mut self, gas_limits: Gas) -> Self {
        self.gas_limits = Option::some(gas_limits);
        *self
    }

    /// Sets the teardown gas limits for the transaction.
    ///
    /// If not set, defaults to 1/8 of the protocol maximum.
    pub fn with_teardown_gas_limits(&mut self, teardown_gas_limits: Gas) -> Self {
        self.teardown_gas_limits = Option::some(teardown_gas_limits);
        *self
    }

    /// Sets the maximum fees per gas unit the sender is willing to pay.
    ///
    /// If not set, defaults to zero.
    pub fn with_max_fees_per_gas(&mut self, max_fees_per_gas: GasFees) -> Self {
        self.max_fees_per_gas = Option::some(max_fees_per_gas);
        *self
    }

    /// Sets the maximum priority fees per gas unit.
    ///
    /// If not set, defaults to zero.
    pub fn with_max_priority_fees_per_gas(&mut self, max_priority_fees_per_gas: GasFees) -> Self {
        self.max_priority_fees_per_gas = Option::some(max_priority_fees_per_gas);
        *self
    }

    /// Sets all gas settings at once.
    ///
    /// Equivalent to calling [`with_gas_limits`](PrivateContextOptions::with_gas_limits),
    /// [`with_teardown_gas_limits`](PrivateContextOptions::with_teardown_gas_limits),
    /// [`with_max_fees_per_gas`](PrivateContextOptions::with_max_fees_per_gas), and
    /// [`with_max_priority_fees_per_gas`](PrivateContextOptions::with_max_priority_fees_per_gas) individually.
    pub fn with_gas_settings(&mut self, gas_settings: GasSettings) -> Self {
        self.gas_limits = Option::some(gas_settings.gas_limits);
        self.teardown_gas_limits = Option::some(gas_settings.teardown_gas_limits);
        self.max_fees_per_gas = Option::some(gas_settings.max_fees_per_gas);
        self.max_priority_fees_per_gas = Option::some(gas_settings.max_priority_fees_per_gas);
        *self
    }

    fn resolve_gas_settings(self) -> GasSettings {
        resolve_gas_settings(
            self.gas_limits,
            self.teardown_gas_limits,
            self.max_fees_per_gas,
            self.max_priority_fees_per_gas,
        )
    }
}

struct PublicContextOptions {
    contract_address: Option<AztecAddress>,
}

struct UtilityContextOptions {
    contract_address: Option<AztecAddress>,
}

/// Configuration for [`TestEnvironment::call_private_opts`].
///
/// Constructed by calling [`CallPrivateOptions::new`] and then chaining methods setting each value:
///
/// ```noir
/// env.call_private_opts(from, CallPrivateOptions::new().with_additional_scopes([other]), call);
/// ```
pub struct CallPrivateOptions<let N: u32, let T: u32> {
    additional_scopes: [AztecAddress; N],
    authorized_utility_call_targets: [AztecAddress; T],
    gas_limits: Option<Gas>,
    teardown_gas_limits: Option<Gas>,
    max_fees_per_gas: Option<GasFees>,
    max_priority_fees_per_gas: Option<GasFees>,
}

impl CallPrivateOptions<0, 0> {
    /// Creates default `CallPrivateOptions`.
    ///
    /// The default values are the same as if using [`TestEnvironment::call_private`] instead of
    /// [`TestEnvironment::call_private_opts`].
    pub fn new() -> Self {
        CallPrivateOptions {
            additional_scopes: [],
            authorized_utility_call_targets: [],
            gas_limits: Option::none(),
            teardown_gas_limits: Option::none(),
            max_fees_per_gas: Option::none(),
            max_priority_fees_per_gas: Option::none(),
        }
    }
}

impl<let N: u32, let T: u32> CallPrivateOptions<N, T> {
    /// Grants access to secrets of additional accounts.
    ///
    /// By default only the secrets that belong to the `from` account can be accessed: this function lets contracts
    /// retrieve private information from other accounts during execution.
    ///
    /// Example usage includes accounts withdrawing from an escrow, which may require accessing the escrow's own notes
    /// and secrets.
    pub fn with_additional_scopes<let N_2: u32>(
        self,
        additional_scopes: [AztecAddress; N_2],
    ) -> CallPrivateOptions<N_2, T> {
        CallPrivateOptions {
            additional_scopes,
            authorized_utility_call_targets: self.authorized_utility_call_targets,
            gas_limits: self.gas_limits,
            teardown_gas_limits: self.teardown_gas_limits,
            max_fees_per_gas: self.max_fees_per_gas,
            max_priority_fees_per_gas: self.max_priority_fees_per_gas,
        }
    }

    /// Authorizes cross-contract utility calls to given targets.
    ///
    /// By default, cross-contract utility calls are denied. This method lets the test author specify which target
    /// contracts are allowed to be called via utility functions during execution.
    pub fn with_authorized_utility_call_targets<let T_2: u32>(
        self,
        targets: [AztecAddress; T_2],
    ) -> CallPrivateOptions<N, T_2> {
        CallPrivateOptions {
            additional_scopes: self.additional_scopes,
            authorized_utility_call_targets: targets,
            gas_limits: self.gas_limits,
            teardown_gas_limits: self.teardown_gas_limits,
            max_fees_per_gas: self.max_fees_per_gas,
            max_priority_fees_per_gas: self.max_priority_fees_per_gas,
        }
    }

    /// Sets the gas limits for the transaction.
    ///
    /// If not set, defaults to the maximum the protocol allows.
    pub fn with_gas_limits(mut self, gas_limits: Gas) -> Self {
        self.gas_limits = Option::some(gas_limits);
        self
    }

    /// Sets the teardown gas limits for the transaction.
    ///
    /// If not set, defaults to 1/8 of the protocol maximum.
    pub fn with_teardown_gas_limits(mut self, teardown_gas_limits: Gas) -> Self {
        self.teardown_gas_limits = Option::some(teardown_gas_limits);
        self
    }

    /// Sets the maximum fees per gas unit the sender is willing to pay.
    ///
    /// If not set, defaults to zero.
    pub fn with_max_fees_per_gas(mut self, max_fees_per_gas: GasFees) -> Self {
        self.max_fees_per_gas = Option::some(max_fees_per_gas);
        self
    }

    /// Sets the maximum priority fees per gas unit.
    ///
    /// If not set, defaults to zero.
    pub fn with_max_priority_fees_per_gas(mut self, max_priority_fees_per_gas: GasFees) -> Self {
        self.max_priority_fees_per_gas = Option::some(max_priority_fees_per_gas);
        self
    }

    /// Convenience method to set all four gas settings fields at once.
    ///
    /// Equivalent to calling [`with_gas_limits`](CallPrivateOptions::with_gas_limits),
    /// [`with_teardown_gas_limits`](CallPrivateOptions::with_teardown_gas_limits),
    /// [`with_max_fees_per_gas`](CallPrivateOptions::with_max_fees_per_gas), and
    /// [`with_max_priority_fees_per_gas`](CallPrivateOptions::with_max_priority_fees_per_gas) individually.
    pub fn with_gas_settings(mut self, gas_settings: GasSettings) -> Self {
        self.gas_limits = Option::some(gas_settings.gas_limits);
        self.teardown_gas_limits = Option::some(gas_settings.teardown_gas_limits);
        self.max_fees_per_gas = Option::some(gas_settings.max_fees_per_gas);
        self.max_priority_fees_per_gas = Option::some(gas_settings.max_priority_fees_per_gas);
        self
    }

    fn resolve_gas_settings(self) -> GasSettings {
        resolve_gas_settings(
            self.gas_limits,
            self.teardown_gas_limits,
            self.max_fees_per_gas,
            self.max_priority_fees_per_gas,
        )
    }
}

/// Configuration for [`TestEnvironment::view_private_opts`].
///
/// Constructed by calling [`ViewPrivateOptions::new`] and then chaining methods setting each value:
///
/// ```noir
/// env.view_private_opts(from, ViewPrivateOptions::new().with_additional_scopes([other]), call);
/// ```
pub struct ViewPrivateOptions<let S: u32, let T: u32> {
    additional_scopes: [AztecAddress; S],
    authorized_utility_call_targets: [AztecAddress; T],
}

impl ViewPrivateOptions<0, 0> {
    /// Creates default `ViewPrivateOptions`.
    ///
    /// The default values are the same as if using [`TestEnvironment::view_private`] instead of
    /// [`TestEnvironment::view_private_opts`].
    pub fn new() -> Self {
        ViewPrivateOptions { additional_scopes: [], authorized_utility_call_targets: [] }
    }
}

impl<let S: u32, let T: u32> ViewPrivateOptions<S, T> {
    /// Grants access to secrets of additional accounts.
    ///
    /// By default only the secrets that belong to the `from` account can be accessed: this function lets contracts
    /// retrieve private information from other accounts during execution.
    ///
    /// Example usage includes accounts querying an escrow's balance, which may require accessing the escrow's own
    /// notes.
    pub fn with_additional_scopes<let S2: u32>(
        self,
        additional_scopes: [AztecAddress; S2],
    ) -> ViewPrivateOptions<S2, T> {
        ViewPrivateOptions { additional_scopes, authorized_utility_call_targets: self.authorized_utility_call_targets }
    }

    /// Authorizes cross-contract utility calls to given targets.
    ///
    /// By default, cross-contract utility calls are denied. This method lets the test author specify which target
    /// contracts are allowed to be called via utility functions during execution.
    pub fn with_authorized_utility_call_targets<let T_2: u32>(
        self,
        targets: [AztecAddress; T_2],
    ) -> ViewPrivateOptions<S, T_2> {
        ViewPrivateOptions { additional_scopes: self.additional_scopes, authorized_utility_call_targets: targets }
    }
}

struct NoteDiscoveryOptions {
    contract_address: Option<AztecAddress>,
}

struct EventDiscoveryOptions {
    contract_address: Option<AztecAddress>,
}

/// Configuration for [`TestEnvironment::execute_utility_opts`].
///
/// Constructed by calling [`ExecuteUtilityOptions::new`] and then chaining methods:
///
/// ```noir
/// env.execute_utility_opts(
///     ExecuteUtilityOptions::new().with_from(caller).with_authorized_utility_call_targets([target]),
///     SomeContract::at(addr).some_utility_function(),
/// );
/// ```
pub struct ExecuteUtilityOptions<let T: u32> {
    from: Option<AztecAddress>,
    authorized_utility_call_targets: [AztecAddress; T],
}

impl ExecuteUtilityOptions<0> {
    /// Creates default `ExecuteUtilityOptions`.
    pub fn new() -> Self {
        ExecuteUtilityOptions { from: Option::none(), authorized_utility_call_targets: [] }
    }
}

impl<let T: u32> ExecuteUtilityOptions<T> {
    /// Sets the `msg_sender` simulating a cross-contract call.
    ///
    /// By default, an `Option::none` value is supplied to `maybe_msg_sender`.
    pub fn with_from(&mut self, from: AztecAddress) -> Self {
        self.from = Option::some(from);
        *self
    }

    /// Authorizes cross-contract utility calls to given targets.
    ///
    /// By default, cross-contract utility calls are denied. This method lets the test author specify which target
    /// contracts are allowed to be called via utility functions during execution.
    pub fn with_authorized_utility_call_targets<let T_2: u32>(
        self: Self,
        targets: [AztecAddress; T_2],
    ) -> ExecuteUtilityOptions<T_2> {
        ExecuteUtilityOptions { from: self.from, authorized_utility_call_targets: targets }
    }
}

/// Configuration values for [`TestEnvironment::deploy_opts`]. Meant to be used by calling `new` and then chaining
/// methods setting each value, e.g.:
/// ```noir
/// env.deploy_opts(DeployOptions::new().with_salt(42).with_secret(100), "MyContract").without_initializer();
/// ```
pub struct DeployOptions {
    salt: Option<Field>,
    secret: Option<Field>,
}

impl DeployOptions {
    /// Creates a new `DeployOptions` with default values, i.e. the same as if using the `deploy` method instead of
    /// `deploy_opts`. Use the `with_salt` and `with_secret` methods to set the desired configuration values.
    pub fn new() -> Self {
        Self { salt: Option::none(), secret: Option::none() }
    }

    /// Sets the deployment salt. The salt affects the resulting contract address: the same contract deployed with
    /// different salts will have different addresses.
    pub fn with_salt(&mut self, salt: Field) -> Self {
        self.salt = Option::some(salt);
        *self
    }

    /// Sets the secret used for key derivation. The secret affects the contract's public keys and therefore its
    /// address: the same contract deployed with different secrets will have different addresses.
    pub fn with_secret(&mut self, secret: Field) -> Self {
        self.secret = Option::some(secret);
        *self
    }
}

/// Configuration values for [`TestEnvironment::call_public_opts`]. Meant to be used by calling `new` and then chaining
/// methods setting each value, e.g.:
/// ```noir
/// env.call_public_opts(caller, CallPublicOptions::new().with_max_fees_per_gas(GasFees::new(1, 1)),
/// MyContract::at(addr).fn());
/// ```
///
/// Gas settings fields are not cross-validated - nonsense combinations (e.g. `teardown_gas_limits` larger than
/// `gas_limits`) will be forwarded as-is and may be rejected by simulation.
pub struct CallPublicOptions {
    gas_limits: Option<Gas>,
    teardown_gas_limits: Option<Gas>,
    max_fees_per_gas: Option<GasFees>,
    max_priority_fees_per_gas: Option<GasFees>,
}

impl CallPublicOptions {
    /// Creates a new `CallPublicOptions` with default values, i.e. the same as if using
    /// [`TestEnvironment::call_public`] without the `_opts` variant.
    pub fn new() -> Self {
        Self {
            gas_limits: Option::none(),
            teardown_gas_limits: Option::none(),
            max_fees_per_gas: Option::none(),
            max_priority_fees_per_gas: Option::none(),
        }
    }

    /// Sets the gas limits for the transaction.
    ///
    /// If not set, defaults to the maximum the protocol allows.
    pub fn with_gas_limits(&mut self, gas_limits: Gas) -> Self {
        self.gas_limits = Option::some(gas_limits);
        *self
    }

    /// Sets the teardown gas limits for the transaction.
    ///
    /// If not set, defaults to 1/8 of the protocol maximum.
    pub fn with_teardown_gas_limits(&mut self, teardown_gas_limits: Gas) -> Self {
        self.teardown_gas_limits = Option::some(teardown_gas_limits);
        *self
    }

    /// Sets the maximum fees per gas unit the sender is willing to pay.
    ///
    /// If not set, defaults to zero.
    pub fn with_max_fees_per_gas(&mut self, max_fees_per_gas: GasFees) -> Self {
        self.max_fees_per_gas = Option::some(max_fees_per_gas);
        *self
    }

    /// Sets the maximum priority fees per gas unit.
    ///
    /// If not set, defaults to zero.
    pub fn with_max_priority_fees_per_gas(&mut self, max_priority_fees_per_gas: GasFees) -> Self {
        self.max_priority_fees_per_gas = Option::some(max_priority_fees_per_gas);
        *self
    }

    /// Convenience method to set all four gas settings fields at once.
    ///
    /// Equivalent to calling [`with_gas_limits`](CallPublicOptions::with_gas_limits),
    /// [`with_teardown_gas_limits`](CallPublicOptions::with_teardown_gas_limits),
    /// [`with_max_fees_per_gas`](CallPublicOptions::with_max_fees_per_gas), and
    /// [`with_max_priority_fees_per_gas`](CallPublicOptions::with_max_priority_fees_per_gas) individually.
    pub fn with_gas_settings(&mut self, gas_settings: GasSettings) -> Self {
        self.gas_limits = Option::some(gas_settings.gas_limits);
        self.teardown_gas_limits = Option::some(gas_settings.teardown_gas_limits);
        self.max_fees_per_gas = Option::some(gas_settings.max_fees_per_gas);
        self.max_priority_fees_per_gas = Option::some(gas_settings.max_priority_fees_per_gas);
        *self
    }

    fn resolve_gas_settings(self) -> GasSettings {
        resolve_gas_settings(
            self.gas_limits,
            self.teardown_gas_limits,
            self.max_fees_per_gas,
            self.max_priority_fees_per_gas,
        )
    }
}

/// Resolves `GasSettings` from per-component options, applying defaults matching the TXE's built-in values when an
/// option is `None`.
fn resolve_gas_settings(
    gas_limits: Option<Gas>,
    teardown_gas_limits: Option<Gas>,
    max_fees_per_gas: Option<GasFees>,
    max_priority_fees_per_gas: Option<GasFees>,
) -> GasSettings {
    GasSettings::new(
        gas_limits
            .unwrap_or(
                Gas::new(
                    MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT,
                    MAX_PROCESSABLE_L2_GAS,
                ),
            ),
        teardown_gas_limits
            .unwrap_or(
                Gas::new(
                    MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT / 8,
                    MAX_PROCESSABLE_L2_GAS / 8,
                ),
            ),
        max_fees_per_gas.unwrap_or(GasFees::empty()),
        max_priority_fees_per_gas.unwrap_or(GasFees::empty()),
    )
}

impl TestEnvironment {
    /// Creates a new `TestEnvironment`. This function should only be called once per test.
    ///
    /// See [`new_opts`](TestEnvironment::new_opts) for a variant that allows configuring the environment.
    pub unconstrained fn new() -> Self {
        Self::new_opts(TestEnvironmentOptions::new())
    }

    /// Creates a new `TestEnvironment` with the configuration values in `options`. This function should only be
    /// called once per test.
    ///
    /// ### Sample usage
    /// ```noir
    /// let strategy = TaggingSecretStrategy::non_interactive_handshake();
    /// let env = TestEnvironment::new_opts(
    ///     TestEnvironmentOptions::new().with_default_tag_secret_strategy_all_modes(strategy),
    /// );
    /// ```
    pub unconstrained fn new_opts(options: TestEnvironmentOptions) -> Self {
        assert_compatible_oracle_version();
        txe_oracles::assert_compatible_txe_oracle_version();

        txe_oracles::set_tagging_secret_strategies(
            options.default_unconstrained_tagging_secret_strategy,
            options.default_constrained_tagging_secret_strategy,
        );

        txe_oracles::set_authorize_all_utility_call_targets(options.authorize_all_utility_call_targets);

        Self {
            // Use an offset to avoid secret collision with account secrets. Without this, when
            // deploying multiple contracts and creating accounts, they could end up with identical
            // secrets (e.g., Token1 with deployment secret=1 and liquidity_provider with account
            // secret=1), causing key collisions since keys are derived from the secret alone.
            light_account_secret: Counter::new(),
            contract_account_secret: Counter::new_with_offset(1_000),
            contract_deployment_secret: Counter::new_with_offset(2_000),
            // The salt counter does not need an offset because keys (derived from secret) and salt are unrelated: a
            // collision between a salt and a secret value has no effect on the resulting contract address.
            contract_deployment_salt: Counter::new(),
        }
    }

    /// Returns the default address used by [`TestEnvironment::private_context`] and other functions that do not take a
    /// contract address.
    pub(crate) unconstrained fn get_default_address() -> AztecAddress {
        txe_oracles::get_default_address()
    }

    /// Creates a `PublicContext`, which allows using aztec-nr features as if inside a public contract function. Useful
    /// for low-level testing of public state variables and utilities.
    ///
    /// A new block is automatically mined once `public_context` returns, containing all of the side effects caused by
    /// its execution (e.g. public storage writes). It is however **NOT** possible to make any contract calls from this
    /// public context - use `call_public` for testing contract calls (though usage of `call_public` is forbidden while
    /// inside `public_context`).
    ///
    /// Receives a callback function which is called with the created `PublicContext` - this function is where testing
    /// logic is expected to reside. Any values returned by it are bubbled-up and returned to the caller of
    /// `public_context`. Do **NOT** return the `PublicContext` from the callback function, or use it in any way
    /// outside of it - it becomes invalid once `public_context` returns.
    ///
    /// See `public_context_at` for a variant that allows specifying the contract address.
    ///
    /// ### Sample usage
    /// ```noir
    /// env.public_context(|context| {
    ///   let state_var = PublicMutable::new(context, STORAGE_SLOT);
    ///   state_var.write(some_value);
    ///   assert_eq(state_var.read(), some_value);
    /// });
    /// ```
    ///
    /// ### Advanced usage with returns
    /// ```noir
    /// let read_value = env.public_context(|context| {
    ///   let state_var = PublicMutable::new(context, STORAGE_SLOT);
    ///   state_var.read()
    /// });
    /// ```
    pub unconstrained fn public_context<Env, T>(self: Self, f: unconstrained fn[Env](PublicContext) -> T) -> T {
        self.public_context_opts(PublicContextOptions { contract_address: Option::none() }, f)
    }

    /// Variant of [`TestEnvironment::public_context`] which allows specifying the contract address in which the
    /// public context will execute, which will affect note and nullifier siloing, storage access, etc.
    pub unconstrained fn public_context_at<Env, T>(
        self: Self,
        addr: AztecAddress,
        f: unconstrained fn[Env](PublicContext) -> T,
    ) -> T {
        self.public_context_opts(PublicContextOptions { contract_address: Option::some(addr) }, f)
    }

    unconstrained fn public_context_opts<Env, T>(
        _self: Self,
        opts: PublicContextOptions,
        f: unconstrained fn[Env](PublicContext) -> T,
    ) -> T {
        txe_oracles::set_public_txe_context(opts.contract_address);

        let context = PublicContext::new(|| 0);
        let ret_value = f(context);

        txe_oracles::set_top_level_txe_context();

        ret_value
    }

    /// Creates a `PrivateContext`, which allows using aztec-nr features as if inside a private contract function.
    /// Useful for low-level testing of private state variables and utilities.
    ///
    /// A new block is automatically mined once `private_context` returns, containing all of the side effects caused by
    /// its execution (e.g. note and nullifier emission). It is however **NOT** possible to make any contract calls
    /// from this private context, neither private nor enqueued public calls - use `call_private` and `call_public` for
    /// testing contract calls (though usage of these is forbidden while inside `private_context`).
    ///
    /// Receives a callback function which is called with the created `PrivateContext` - this function is where testing
    /// logic is expected to reside. Any values returned by it are bubbled-up and returned to the caller of
    /// `private_context`. Do **NOT** return the `PrivateContext` from the callback function, or use it in any way
    /// outside of it - it becomes invalid once `private_context` returns.
    ///
    /// See `private_context_at` for a variant that allows specifying the contract address, or `private_context_opts`
    /// for even more configurability.
    ///
    /// ### Sample usage
    /// ```noir
    /// env.private_context(|context| {
    ///   let state_var = PrivateMutable::new(context, STORAGE_SLOT);
    ///   let note = SampleNote::new(some_value);
    ///   state_var.initialize(note);
    ///   assert_eq(state_var.get_note(), note);
    /// });
    /// ```
    ///
    /// ### Advanced usage with returns
    /// ```noir
    /// let note = env.private_context(|context| {
    ///   let state_var = PrivateMutable::new(context, STORAGE_SLOT);
    ///   state_var.get_note()
    /// });
    /// ```
    pub unconstrained fn private_context<Env, T>(self: Self, f: unconstrained fn[Env](&mut PrivateContext) -> T) -> T {
        self.private_context_opts(PrivateContextOptions::new(), f)
    }

    /// Variant of [`TestEnvironment::private_context`] which allows specifying the contract address in which the
    /// private context will execute, which will affect note and nullifier siloing, storage access, etc.
    pub unconstrained fn private_context_at<Env, T>(
        self: Self,
        addr: AztecAddress,
        f: unconstrained fn[Env](&mut PrivateContext) -> T,
    ) -> T {
        self.private_context_opts(PrivateContextOptions::new().at_contract_address(addr), f)
    }

    /// Variant of [`TestEnvironment::private_context`] which allows specifying multiple configuration values via
    /// [`PrivateContextOptions`].
    pub unconstrained fn private_context_opts<Env, T>(
        _self: Self,
        opts: PrivateContextOptions,
        f: unconstrained fn[Env](&mut PrivateContext) -> T,
    ) -> T {
        let mut context = PrivateContext::new(
            txe_oracles::set_private_txe_context(
                opts.contract_address,
                opts.anchor_block_number,
                opts.resolve_gas_settings(),
            ),
            0,
        );

        let ret_value = f(&mut context);

        txe_oracles::set_top_level_txe_context();

        ret_value
    }

    /// Creates a `UtilityContext`, which allows using aztec-nr features as if inside a utility contract function.
    /// Useful for low-level testing of private and public state variable utilities.
    ///
    /// Receives a callback function which is called with the created `Utility` - this function is where testing logic
    /// is expected to reside. Any values returned by it are bubbled-up and returned to the caller of
    /// `utility_context`. Do **NOT** return the `Utility` from the callback function, or use it in any way outside of
    /// it - it becomes invalid once `utility_context` returns.
    ///
    /// See `utility_context_at` for a variant that allows specifying the contract address.
    ///
    /// ### Sample usage
    /// ```noir
    /// env.utility_context(|context| {
    ///   let state_var = PrivateMutable::new(context, STORAGE_SLOT);
    ///   let note = SampleNote::new(some_value);
    ///   assert_eq(state_var.view_note(), note);
    /// });
    /// ```
    ///
    /// ### Advanced usage with returns
    /// ```noir
    /// let note = env.utility_context(|context| {
    ///   let state_var = PrivateMutable::new(context, STORAGE_SLOT);
    ///   state_var.view_note()
    /// });
    /// ```
    pub unconstrained fn utility_context<Env, T>(self: Self, f: unconstrained fn[Env](UtilityContext) -> T) -> T {
        self.utility_context_opts(UtilityContextOptions { contract_address: Option::none() }, f)
    }

    /// Variant of [`TestEnvironment::utility_context`] which allows specifying the contract address in which the
    /// utility context will execute, which will affect note and storage access.
    pub unconstrained fn utility_context_at<Env, T>(
        self: Self,
        addr: AztecAddress,
        f: unconstrained fn[Env](UtilityContext) -> T,
    ) -> T {
        self.utility_context_opts(UtilityContextOptions { contract_address: Option::some(addr) }, f)
    }

    unconstrained fn utility_context_opts<Env, T>(
        _self: Self,
        opts: UtilityContextOptions,
        f: unconstrained fn[Env](UtilityContext) -> T,
    ) -> T {
        txe_oracles::set_utility_txe_context(opts.contract_address);
        let context = UtilityContext::new();
        let ret_value = f(context);
        txe_oracles::set_top_level_txe_context();

        ret_value
    }

    /// Returns the number of the next block to be mined.
    pub unconstrained fn next_block_number(_self: Self) -> u32 {
        txe_oracles::get_next_block_number()
    }

    /// Returns the number of the last mined block. This is the default anchor block for `private_context` and
    /// `private_call`.
    pub unconstrained fn last_block_number(_self: Self) -> u32 {
        txe_oracles::get_next_block_number() - 1
    }

    /// Returns the timestamp of the last mined block. Note that block timestamps do not automatically advance - this
    /// must be done by calling `mine_block_at` or `set_next_block_timestamp`.
    pub unconstrained fn last_block_timestamp(_self: Self) -> u64 {
        txe_oracles::get_last_block_timestamp()
    }

    /// Mines an empty block (i.e. with no transactions) at `timestamp`, causing followup public executions to occur at
    /// that timestamp (e.g. via `call_public` or `public_context`), and making it possible to create private
    /// executions at the specified timestamp (e.g. via `call_private` or `private_context`).
    pub unconstrained fn mine_block_at(self, timestamp: u64) {
        self.set_next_block_timestamp(timestamp);
        self.mine_block();
    }

    /// Sets the timestamp of the next block to be mined, causing followup public executions to occur at that timestamp
    /// (e.g. via `call_public` or `public_context`).
    pub unconstrained fn set_next_block_timestamp(self, timestamp: u64) {
        let pending_timestamp = txe_oracles::get_next_block_timestamp();
        assert(pending_timestamp <= timestamp, "Cannot go back in time. Timestamp cannot be before next timestamp.");
        let difference: u64 = timestamp - pending_timestamp;
        self.advance_next_block_timestamp_by(difference);
    }

    /// Mines an empty block (i.e. with no transactions). Note that block timestamps do not automatically advance -
    /// this must be done by calling `mine_block_at` or `set_next_block_timestamp`.
    pub unconstrained fn mine_block(_self: Self) {
        txe_oracles::advance_blocks_by(1);
    }

    /// Sets the timestamp of the next block to be mined to be ahead of the last one by `duration`.
    pub unconstrained fn advance_next_block_timestamp_by(_self: Self, duration: u64) {
        txe_oracles::advance_timestamp_by(duration);
    }

    /// Creates a message sent from the L1 to the L2.
    ///
    /// This is required so that a contract can later consume it via
    /// [`PrivateContext::consume_l1_to_l2_message`](crate::context::PrivateContext::consume_l1_to_l2_message) or its
    /// public counterpart. An empty block is mined carrying the message leaf.
    ///
    /// `content`, `secret`, `sender` and `recipient` must match what the consuming contract uses. The secret is hashed
    /// with the standard [`crate::hash::compute_secret_hash`] - use
    /// [`send_l1_to_l2_message_from_secret_hash`](TestEnvironment::send_l1_to_l2_message_from_secret_hash) if the
    /// contract commits to its secret differently).
    ///
    /// Returns the global leaf index to pass as `consume_l1_to_l2_message`'s `leaf_index`.
    pub unconstrained fn send_l1_to_l2_message(
        self,
        content: Field,
        secret: Field,
        sender: EthAddress,
        recipient: AztecAddress,
    ) -> Field {
        self.send_l1_to_l2_message_from_secret_hash(content, compute_secret_hash([secret]), sender, recipient)
    }

    /// Variant of [`send_l1_to_l2_message`](TestEnvironment::send_l1_to_l2_message) that takes the secret hash
    /// directly.
    ///
    /// This is only required by contracts that commit to their consumption secret with a non-standard hash function.
    pub unconstrained fn send_l1_to_l2_message_from_secret_hash(
        _self: Self,
        content: Field,
        secret_hash: Field,
        sender: EthAddress,
        recipient: AztecAddress,
    ) -> Field {
        txe_oracles::send_l1_to_l2_message(content, secret_hash, sender, recipient)
    }

    /// Creates a new account that can be used as the `from` parameter in contract calls, e.g. in `private_call` or
    /// `public_call`, or be made the owner or recipient of notes in `private_context`.
    ///
    /// The returned account has a full set of privacy keys, so it can nullify notes, receive messages, etc. It also
    /// has an associated `SchnorrAccount` contract that can process authwit requests - the authwits can be added via
    /// the `add_private_authwit_from_call` and `add_public_authwit_from_call` helper functions. If authwits are not
    /// required, consider using `create_light_account` instead, which is a faster variant of this function.
    ///
    /// Each call to `create_contract_account` will return a different address, and so it can be called repeatedly to
    /// generate multiple addresses. These addresses are also different from the ones that `create_light_account`
    /// returns, and so these two functions can be mixed and match to create a set of unique accounts.
    pub unconstrained fn create_contract_account(&mut self) -> AztecAddress {
        let test_account = txe_oracles::add_account(self.contract_account_secret.next());
        let address = test_account.address;

        // We set the deployed account contract's address as "from" such that the scopes are correctly set and the
        // constructor can access its own keys.
        let _ = self.call_private(
            address,
            PrivateCall::<_, _, ()>::new(
                address,
                comptime { FunctionSelector::from_signature("constructor(Field,Field)") },
                "constructor",
                [test_account.keys.ivpk_m.inner.x, test_account.keys.ivpk_m.inner.y],
            ),
        );

        address
    }

    /// Creates a new account that can be used as the `from` parameter in contract calls, e.g. in `private_call` or
    /// `public_call`, or be made the owner or recipient of notes in `private_context`. This is a faster variant of
    /// `create_contract_account`, but comes with reduced capabilities.
    ///
    /// The returned account has a full set of privacy keys, so it can nullify notes, receive messages, etc. It doesn't
    /// however have an associated account contract, so it cannot process private authwit requests. If calling
    /// contracts that rely on private authwits, use `create_contract_account` instead.
    ///
    /// Each call to `create_light_account` will return a different address, and so it can be called repeatedly to
    /// generate multiple addresses. These addresses are also different from the ones that `create_contract_account`
    /// returns, and so these two functions can be mixed and match to create a set of unique accounts.
    pub unconstrained fn create_light_account(&mut self) -> AztecAddress {
        let test_account = txe_oracles::create_account(self.light_account_secret.next());
        test_account.address
    }

    /// Prepares a contract for deployment, so that its private, public and utility functions can be called. The
    /// contract **must be already compiled** before tests are run, and **must be recompiled if changed** for the tests
    /// to deploy the updated version.
    ///
    /// In order to finalize the deployment, the proper initializer function must be specified via one of the
    /// associated methods. For more information on how to specify the path and initialization, read the sections
    /// below.
    ///
    /// ### Path Contracts can be deployed from either the same crate as the test, from a different crate in the same workspace, or from an altogether independent crate.
    ///
    /// If deploying contracts from the same crate as the test, just refer to it by its name:
    /// ```noir
    /// TestEnvironment::new().deploy("MyContract");
    /// ```
    ///
    /// If deploying contracts from a different crate in the same workspace, use `@crate_name/contract_name`:
    /// ```noir
    /// TestEnvironment::new().deploy("@my_contract_crate/MyContract");
    /// ```
    ///
    /// If deploying contracts from a crate not in the workspace, use `path_to_crate/contract_name`, with the crate
    /// path relative to the current workspace:
    /// ```noir
    /// TestEnvironment::new().deploy("../my_other_crate/MyContract");
    /// ```
    ///
    /// ### Initialization If no initializer function needs to be called, use `without_initializer`:
    /// ```noir
    /// let my_contract = TestEnvironment::new().deploy("MyContract").without_initializer();
    /// ```
    ///
    /// For private initializers, use `with_private_initializer`:
    /// ```noir
    /// let my_contract = TestEnvironment::new().deploy("MyContract").with_private_initializer(
    ///   PrivateInitContract::interface().private_init_fn(init_args)
    /// );
    /// ```
    ///
    /// For public initializers, use `with_public_initializer`:
    /// ```noir
    /// let my_contract = TestEnvironment::new().deploy("MyContract").with_public_initializer(
    ///   PublicInitContract::interface().public_init_fn(init_args)
    /// );
    /// ```
    pub unconstrained fn deploy<let N: u32>(&mut self, path: str<N>) -> ContractDeployment<N> {
        self.deploy_opts(DeployOptions::new(), path)
    }

    /// Variant of `deploy` which allows specifying configuration values via `DeployOptions`, such as a custom salt
    /// or secret. If not specified, the salt and secret default to values from internal counters.
    pub unconstrained fn deploy_opts<let N: u32>(
        &mut self,
        opts: DeployOptions,
        path: str<N>,
    ) -> ContractDeployment<N> {
        let secret = opts.secret.unwrap_or_else(|| self.contract_deployment_secret.next());
        let salt = opts.salt.unwrap_or_else(|| self.contract_deployment_salt.next());
        ContractDeployment { env: *self, path, secret, salt }
    }

    /// Performs a private contract function call, including the processing of any nested private calls and enqueued
    /// public calls. Returns the result of the called function.
    ///
    /// The function is called by the `from` address - use `create_contract_account` or `create_light_account` to
    /// generate sender addresses, depending on whether support for private authwit verification is required or not.
    /// Note that execution will begin directly in the called function - no entrypoint function in `from` will be
    /// executed.
    ///
    /// A transaction is created containing all side effects of the call, which is then included in a block that gets
    /// mined by the time `call_private` returns. It is therefore possible to chain multiple private or public function
    /// calls that operate on the result of prior calls.
    ///
    /// The `call` value can be obtained by calling the appropriate method on a contract type. E.g.:
    ///
    /// ```noir
    /// let caller = env.create_light_account();
    /// let contract_addr = env.deploy("SampleContract").without_initializer();
    /// let return_value = env.call_private(caller, SampleContract::at(contract_addr).sample_private_function());
    /// ```
    pub unconstrained fn call_private<let M: u32, let N: u32, T>(
        self: Self,
        from: AztecAddress,
        call: PrivateCall<M, N, T>,
    ) -> T
    where
        T: Deserialize,
    {
        self.call_private_opts(from, CallPrivateOptions::new(), call)
    }

    /// Variant of [`TestEnvironment::call_private`] which allows specifying multiple configuration values via
    /// [`CallPrivateOptions`], including additional account scopes, authorized utility call targets, and gas settings.
    pub unconstrained fn call_private_opts<let M: u32, let N: u32, let S: u32, let U: u32, T>(
        _self: Self,
        from: AztecAddress,
        opts: CallPrivateOptions<S, U>,
        call: PrivateCall<M, N, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::private_call_new_flow(
            Option::some(from),
            call.target_contract,
            call.selector,
            call.args,
            hash_args(call.args),
            /*is_static=*/ false,
            opts.additional_scopes,
            opts.authorized_utility_call_targets,
            opts.resolve_gas_settings(),
        );

        T::deserialize(serialized_return_values)
    }

    /// Variant of `call_private` for private `#[view]` functions.
    ///
    /// Unlike `call_private`, no transaction is created and no block is mined (since `#[view]` functions are only
    /// executable in a static context, and these produce no side effects).
    ///
    /// The `from` parameter specifies the account from whose perspective the view is executed. This affects
    /// scope isolation - only notes scoped to this account will be visible during execution.
    pub unconstrained fn view_private<let M: u32, let N: u32, T>(
        self: Self,
        from: AztecAddress,
        call: PrivateStaticCall<M, N, T>,
    ) -> T
    where
        T: Deserialize,
    {
        self.view_private_opts(from, ViewPrivateOptions::new(), call)
    }

    /// Variant of `view_private` which allows specifying multiple configuration values via `ViewPrivateOptions`.
    pub unconstrained fn view_private_opts<let M: u32, let N: u32, let S: u32, let U: u32, T>(
        _self: Self,
        from: AztecAddress,
        opts: ViewPrivateOptions<S, U>,
        call: PrivateStaticCall<M, N, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::private_call_new_flow(
            Option::some(from),
            call.target_contract,
            call.selector,
            call.args,
            hash_args(call.args),
            /*is_static=*/ true,
            opts.additional_scopes,
            opts.authorized_utility_call_targets,
            // Views never produce a tx, so gas settings don't influence behaviour - we pass defaults.
            resolve_gas_settings(
                Option::none(),
                Option::none(),
                Option::none(),
                Option::none(),
            ),
        );

        T::deserialize(serialized_return_values)
    }

    /// Performs a utility contract function call and returns the result of the called function.
    ///
    /// The `call` value can be obtained by calling the appropriate method on a contract type. E.g.:
    ///
    /// ```noir
    /// let contract_addr = env.deploy("SampleContract").without_initializer();
    /// let return_value = env.execute_utility(SampleContract::at(contract_addr).sample_utility_function());
    /// ```
    pub unconstrained fn execute_utility<let M: u32, let N: u32, T>(self: Self, call: UtilityCall<M, N, T>) -> T
    where
        T: Deserialize,
    {
        self.execute_utility_opts(ExecuteUtilityOptions::new(), call)
    }

    /// Variant of `execute_utility` which allows specifying configuration values via `ExecuteUtilityOptions`, such as
    /// `msg_sender` or authorizing cross-contract utility calls.
    pub unconstrained fn execute_utility_opts<let M: u32, let N: u32, let U: u32, T>(
        _self: Self,
        opts: ExecuteUtilityOptions<U>,
        call: UtilityCall<M, N, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::execute_utility_function(
            opts.from,
            call.target_contract,
            call.selector,
            call.args,
            opts.authorized_utility_call_targets,
        );

        T::deserialize(serialized_return_values)
    }

    /// Returns offchain messages emitted by the last top-level call into TXE.
    ///
    /// The returned `BoundedVec<OffchainMessage, _>` can be passed directly to a contract's `offchain_receive`
    /// utility function to ingest the messages into the recipient's private state.
    ///
    /// Each returned message is populated with:
    /// - `ciphertext`, `recipient`: decoded from the raw emitted payload.
    /// - `tx_hash`: `Option::some(hash)` for tx-producing entry points (`call_private`,
    ///   `call_public`); `Option::none()` for tx-less entry points (`execute_utility`,
    ///   `private_context`, `utility_context`).
    /// - `anchor_block_timestamp`: the timestamp of the block the top-level call was
    ///   anchored against, matching the value the production flow would produce.
    ///
    /// Returns up to `MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY` messages. The caller is responsible for
    /// splitting the result into batches that fit `MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL` before
    /// forwarding each batch to `offchain_receive`.
    ///
    /// # Example
    ///
    /// ```noir
    /// env.call_private(sender, Token::at(token).transfer_in_private_with_offchain_delivery(...));
    /// let messages = env.offchain_messages();
    /// let mut batch: BoundedVec<_, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
    /// for i in 0..messages.len() { batch.push(messages.get(i)); }
    /// env.execute_utility(Token::at(token).offchain_receive(batch));
    /// ```
    pub unconstrained fn offchain_messages(
        _self: Self,
    ) -> BoundedVec<OffchainMessage, txe_oracles::MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY> {
        let raw_effects = txe_oracles::get_last_call_offchain_effects();
        let txe_oracles::TXECallContext { tx_hash, anchor_block_timestamp } = txe_oracles::get_last_call_context();

        let mut messages: BoundedVec<OffchainMessage, txe_oracles::MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY> =
            BoundedVec::new();

        for i in 0..raw_effects.len() {
            let payload = raw_effects.get(i);

            // The raw payload layout produced by `deliver_offchain_message` is:
            //   [OFFCHAIN_MESSAGE_IDENTIFIER, recipient, ...ciphertext]
            // A call may also emit offchain effects that are *not* `OffchainMessage`s (e.g. authwit requests
            // via `auth.nr::emit_offchain_effect`). We only concern ourselves with offchain messages here.
            if payload.get(0) == OFFCHAIN_MESSAGE_IDENTIFIER {
                let recipient = AztecAddress::from_field(payload.get(1));

                let mut ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN> = BoundedVec::new();
                for j in 0..MESSAGE_CIPHERTEXT_LEN {
                    ciphertext.push(payload.get(2 + j));
                }

                messages.push(OffchainMessage { ciphertext, recipient, tx_hash, anchor_block_timestamp });
            }
        }

        messages
    }

    /// Performs a public contract function call, including the processing of any nested public calls. Returns the
    /// result of the called function.
    ///
    /// The function is called by the `from` address - use `create_contract_account` or `create_light_account` to
    /// generate sender addresses. Note that execution will begin directly in the called function - no private
    /// entrypoint function in `from` will be executed - in fact no private execution of any kind will be performed.
    ///
    /// A transaction is created containing all side effects of the call, which is then included in a block that gets
    /// mined by the time `call_public` returns. It is therefore possible to chain multiple private or public function
    /// calls that operate on the result of prior calls.
    ///
    /// The `call` value can be obtained by calling the appropriate method on a contract type. E.g.:
    ///
    /// ```noir
    /// let caller = env.create_light_account();
    /// let contract_addr = env.deploy("SampleContract").without_initializer();
    /// let return_value = env.call_public(caller, SampleContract::at(contract_addr).sample_public_function());
    /// ```
    pub unconstrained fn call_public<let M: u32, let N: u32, T>(
        _self: Self,
        from: AztecAddress,
        call: PublicCall<M, N, T>,
    ) -> T
    where
        T: Deserialize,
    {
        _self.call_public_opts(from, CallPublicOptions::new(), call)
    }

    /// Variant of [`TestEnvironment::call_public`] which allows specifying gas settings via [`CallPublicOptions`].
    pub unconstrained fn call_public_opts<let M: u32, let N: u32, T>(
        _self: Self,
        from: AztecAddress,
        opts: CallPublicOptions,
        call: PublicCall<M, N, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::public_call_new_flow(
            Option::some(from),
            call.target_contract,
            call.selector,
            call.args,
            false,
            opts.resolve_gas_settings(),
        );
        T::deserialize(serialized_return_values)
    }

    /// Performs a public contract function call, including the processing of any nested public calls. Returns the
    /// result of the called function. Variant of `call_public`, but the `from` address (`msg_sender`) is set to
    /// "null".
    pub unconstrained fn call_public_incognito<let M: u32, let N: u32, T>(_self: Self, call: PublicCall<M, N, T>) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::public_call_new_flow(
            Option::none(),
            call.target_contract,
            call.selector,
            call.args,
            false,
            // Incognito calls bypass the standard sender pathway; gas defaults are fine here.
            resolve_gas_settings(
                Option::none(),
                Option::none(),
                Option::none(),
                Option::none(),
            ),
        );
        T::deserialize(serialized_return_values)
    }

    /// Variant of `call_public` for public `#[view]` functions.
    ///
    /// Unlike `call_public`, no transaction is created and no block is mined (since `#[view]` functions are only
    /// executable in a static context, and these produce no side effects). The `msg_sender` is set to "null", since
    /// view calls have no real caller.
    pub unconstrained fn view_public<let M: u32, let N: u32, T>(_self: Self, call: PublicStaticCall<M, N, T>) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::public_call_new_flow(
            Option::none(),
            call.target_contract,
            call.selector,
            call.args,
            true,
            // Views never produce a tx, so gas settings don't influence behaviour - we pass defaults.
            resolve_gas_settings(
                Option::none(),
                Option::none(),
                Option::none(),
                Option::none(),
            ),
        );

        T::deserialize(serialized_return_values)
    }

    #[deprecated("use `TestEnvironment::view_public` instead")]
    pub unconstrained fn view_public_incognito<let M: u32, let N: u32, T>(
        self: Self,
        call: PublicStaticCall<M, N, T>,
    ) -> T
    where
        T: Deserialize,
    {
        self.view_public(call)
    }

    /// Discovers a note from a [`NoteMessage`], which is expected to have been created in the last transaction
    /// (typically via [`TestEnvironment::private_context`]) so that it can be retrieved in later transactions. This
    /// mimics the normal message processing that takes place automatically in contracts.
    ///
    /// [`NoteMessage`] values are typically returned by aztec-nr state variables that create notes and need to notify
    /// a recipient of their existence. Instead of going through the message encoding, encryption and delivery that
    /// would regularly take place in a contract, this function simply takes the [`NoteMessage`] and processes it as
    /// needed to discover the underlying note.
    ///
    /// See [`TestEnvironment::discover_note_at`] for a variant that allows specifying the contract address the note
    /// belongs to.
    ///
    /// ### Sample usage
    ///
    /// The most common way to invoke this function is to obtain a note message created during the execution of a
    /// [`TestEnvironment::private_context`]:
    ///
    /// ```noir
    /// let note_message = env.private_context(|context| create_note(context, storage_slot, note));
    ///
    /// env.discover_note(note_message);
    ///
    /// env.private_context(|context| { let (hinted_note, _) = get_note::<MockNote>(context, storage_slot); });
    /// ```
    pub unconstrained fn discover_note<Note>(self: Self, note_message: NoteMessage<Note>)
    where
        Note: Packable + NoteType + NoteHash,
    {
        self.discover_note_opts(NoteDiscoveryOptions { contract_address: Option::none() }, note_message);
    }

    /// Variant of [`TestEnvironment::discover_note`] which allows specifying the contract address the note belongs to,
    /// which is required when the note was not emitted in the default address used by
    /// [`TestEnvironment::private_context`].
    ///
    /// ```noir
    /// let note_message = env.private_context_at(contract_address, |context| {
    ///     create_note(context, storage_slot, note)
    /// });
    ///
    /// env.discover_note_at(contract_address, note_message);
    ///
    /// env.private_context_at(contract_address, |context| {
    ///     let (hinted_note, _) = get_note::<MockNote>(context, storage_slot);
    /// });
    /// ```
    pub unconstrained fn discover_note_at<Note>(self: Self, addr: AztecAddress, note_message: NoteMessage<Note>)
    where
        Note: Packable + NoteType + NoteHash,
    {
        self.discover_note_opts(NoteDiscoveryOptions { contract_address: Option::some(addr) }, note_message);
    }

    unconstrained fn discover_note_opts<Note>(self: Self, opts: NoteDiscoveryOptions, note_message: NoteMessage<Note>)
    where
        Note: Packable + NoteType + NoteHash,
    {
        // This function will emulate the message discovery and processing that would happen in a real contract, based
        // on a message created from the received note message.

        // First we produce the message plaintext. We skip encryption/decryption since we're not interested in that
        // here. Note that we need to convert the fixed-size array produced by the encoding functions into a
        // BoundedVec, which is what the decoding functions expect (because they are built to manage protocol logs,
        // which are arbitrarily sized).
        let message_plaintext = BoundedVec::from_array(encode_private_note_message(
            note_message.new_note.note,
            note_message.new_note.owner,
            note_message.new_note.storage_slot,
            note_message.new_note.randomness,
        ));

        // We also need to provide an implementation for the `compute_note_hash` and `compute_note_nullifier`
        // functions, which would typically be created by the macros for the different notes in a given contract. Here
        // we build variants specialized for `Note`.
        let compute_note_hash: ComputeNoteHash = |packed_note, owner, storage_slot, note_type_id, _contract_address, randomness| {
            assert_eq(note_type_id, Note::get_id());
            assert_eq(packed_note.len(), <Note as Packable>::N);

            let note = Note::unpack(subarray(packed_note.storage(), 0));

            Option::some(note.compute_note_hash(owner, storage_slot, randomness))
        };

        let compute_note_nullifier: ComputeNoteNullifier = |unique_note_hash, packed_note, owner, _storage_slot, note_type_id, _contract_address, _randomness| {
            assert_eq(note_type_id, Note::get_id());
            assert_eq(packed_note.len(), <Note as Packable>::N);

            let note = Note::unpack(subarray(packed_note.storage(), 0));

            note.compute_nullifier_unconstrained(owner, unique_note_hash)
        };

        let process_custom_message: Option<CustomMessageHandler> = Option::none();
        self.discover_data_in_message_plaintext(
            message_plaintext,
            opts.contract_address,
            Option::some(note_message.new_note.owner),
            compute_note_hash,
            compute_note_nullifier,
            process_custom_message,
        );
    }

    /// EXPERIMENTAL - not yet part of the public API
    ///
    /// Discovers an event from an [`EventMessage`], which is expected to have been created in the last transaction
    /// (typically via [`TestEnvironment::private_context`]) so that it can be retrieved in queries. This mimics the
    /// normal message processing that takes place automatically in contracts.
    ///
    /// [`EventMessage`] values are returned by aztec-nr private event emitting functions, like
    /// [`crate::contract_self::ContractSelf::emit`], which need to notify a `recipient` of their existence. Instead of
    /// going through the message encoding, encryption and delivery that would regularly take place in a contract, this
    /// function simply takes the [`EventMessage`] and processes it as needed to discover the underlying event.
    ///
    /// As this mimics regular event processing, only `recipient` will have knowledge of the event: other accounts will
    /// not be able to read it.
    ///
    /// See [`TestEnvironment::discover_event_at`] for a variant that allows specifying the contract address the event
    /// belongs to.
    ///
    /// ### Sample usage
    ///
    /// The most common way to invoke this function is to obtain a note message created during the execution of a
    /// [`TestEnvironment::private_context`]:
    ///
    /// ```noir
    /// let event_message = env.private_context(|context| emit_event_in_private(context, event));
    ///
    /// env.discover_event(event_message, recipient);
    /// ```
    pub(crate) unconstrained fn discover_event<Event>(
        self: Self,
        event_message: EventMessage<Event>,
        recipient: AztecAddress,
    )
    where
        Event: Serialize + EventInterface,
    {
        self.discover_event_opts(EventDiscoveryOptions { contract_address: Option::none() }, event_message, recipient);
    }

    /// EXPERIMENTAL - not yet part of the public API
    ///
    /// Variant of [`TestEnvironment::discover_event`] which allows specifying the contract address the event belongs
    /// to, which is required when the event was not emitted in the default address used by
    /// [`TestEnvironment::private_context`].
    ///
    /// ```noir
    /// let event_message = env.private_context_at(contract_address, |context| {
    ///     emit_event_in_private(context, event)
    /// });
    ///
    /// env.discover_event_at(contract_address, event_message);
    /// ```
    #[allow(dead_code)]
    pub(crate) unconstrained fn discover_event_at<Event>(
        self: Self,
        addr: AztecAddress,
        event_message: EventMessage<Event>,
        recipient: AztecAddress,
    )
    where
        Event: Serialize + EventInterface,
    {
        self.discover_event_opts(
            EventDiscoveryOptions { contract_address: Option::some(addr) },
            event_message,
            recipient,
        );
    }

    unconstrained fn discover_event_opts<Event>(
        self: Self,
        opts: EventDiscoveryOptions,
        event_message: EventMessage<Event>,
        recipient: AztecAddress,
    )
    where
        Event: Serialize + EventInterface,
    {
        // This function will emulate the message discovery and processing that would happen in a real contract, based
        // on a message created from the received event message.

        // First we produce the message plaintext. We skip encryption/decryption since we're not interested in that
        // here. Note that we need to convert the fixed-size array produced by the encoding functions into a
        // BoundedVec, which is what the decoding functions expect (because they are built to manage protocol logs,
        // which are arbitrarily sized).
        let message_plaintext = BoundedVec::from_array(encode_private_event_message(
            event_message.new_event.event,
            event_message.new_event.randomness,
        ));

        // We also need to provide an implementation for the `compute_note_hash` and `compute_note_nullifier`
        // functions, which would typically be created by the macros for the different notes in a given contract. Here
        // we build empty ones, since they will never be invoked as this is an event and not a note message.
        let compute_note_hash: ComputeNoteHash = |_packed_note, _owner, _storage_slot, _note_type_id, _contract_address, _randomness| {
            panic(
                f"Unexpected compute_note_hash invocation in TestEnvironment::discover_event",
            )
        };

        let compute_note_nullifier: ComputeNoteNullifier = |_unique_note_hash, _packed_note, _owner, _storage_slot, _note_type_id, _contract_address, _randomness| {
            panic(
                f"Unexpected compute_note_nullifier invocation in TestEnvironment::discover_event",
            )
        };

        let process_custom_message: Option<CustomMessageHandler> = Option::none();
        self.discover_data_in_message_plaintext(
            message_plaintext,
            opts.contract_address,
            Option::some(recipient),
            compute_note_hash,
            compute_note_nullifier,
            process_custom_message,
        );
    }

    unconstrained fn discover_data_in_message_plaintext(
        self,
        message_plaintext: BoundedVec<Field, MESSAGE_PLAINTEXT_LEN>,
        contract_address: Option<AztecAddress>,
        recipient: Option<AztecAddress>,
        compute_note_hash: ComputeNoteHash,
        compute_note_nullifier: ComputeNoteNullifier,
        process_custom_message: Option<CustomMessageHandler>,
    ) {
        // This function will emulate the message discovery and processing that would happen in a real contract, based
        // on a message plaintext.

        // First we fetch the transaction effects from the latest transaction, which are required to create the
        // `ResolvedTx`, and might contain information about data (e.g. notes, events) contained in the message. In
        // a real contract this data would have either been supplied by the `process_message` caller, of retrieved
        // along with the message from a tagged log.
        let effects = txe_oracles::get_last_tx_effects();

        // Real messages would also have a recipient, a concept which is currently half-supported in `TestEnvironment`
        // as events are properly scoped by recipient, but notes use a global scope instead. We therefore simply set
        // the zero address as the recipient if one is not supplied, which PXE accepts as a scope despite this not
        // being a registered account.
        let resolved_tx = ResolvedTx {
            tx_hash: effects.tx_hash,
            unique_note_hashes_in_tx: effects.note_hashes,
            first_nullifier_in_tx: effects.nullifiers.get(0),
            // Test fixture: the simulated message has no real delivery block, so anchor it to the zero block.
            block_number: 0,
            block_hash: 0,
        };

        // The scope controls which PXE account can see discovered notes/events. We use the zero address as the
        // default scope if no recipient is supplied, which PXE accepts despite this not being a registered account.
        //
        // TODO(F-489, @mverzilli): we should revisit how we treat scope in test env, it seems we're treating it too
        // implicitly.
        let scope = recipient.unwrap_or(AztecAddress::zero());

        // Both private and utility functions perform message processing. We do it in an utility context here as that
        // one is more lightweight and does not create new blocks, which also allows for `discover_note` and
        // `discover_event` to be called repeatedly with multiple messages from the same transaction.
        self.utility_context_opts(UtilityContextOptions { contract_address }, |context| {
            process_message_plaintext(
                context.this_address(),
                compute_note_hash,
                compute_note_nullifier,
                process_custom_message,
                message_plaintext,
                resolved_tx,
                scope,
            );

            validate_and_store_enqueued_notes_and_events(scope);
        });
    }
}
