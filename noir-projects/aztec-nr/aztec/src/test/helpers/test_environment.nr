use protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    traits::{Deserialize, Packable},
};

use crate::{
    context::{
        call_interfaces::CallInterface, PrivateCallInterface, PrivateContext,
        PrivateStaticCallInterface, PublicCallInterface, PublicContext, PublicStaticCallInterface,
        UtilityCallInterface, UtilityContext,
    },
    hash::hash_args,
    messages::{
        discovery::{
            ComputeNoteHashAndNullifier, NoteHashAndNullifier,
            process_message::process_message_plaintext,
        },
        logs::note::private_note_to_message_plaintext,
        processing::{message_context::MessageContext, validate_enqueued_notes_and_events},
    },
    note::{
        note_emission::NoteEmission,
        note_interface::{NoteHash, NoteType},
        note_metadata::SettledNoteMetadata,
        retrieved_note::RetrievedNote,
        utils::compute_note_hash_for_nullification,
    },
    oracle::version::assert_compatible_oracle_version,
    test::helpers::{txe_oracles, utils::ContractDeployment},
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

    fn next(&mut self) -> Field {
        let ret = self.next_value;
        self.next_value += 1;
        ret
    }
}

/// This represents an Aztec test run, and contains all the methods utilized during one to interact with the network and
/// manipulate its state (e.g. create accounts, make contract calls, etc.). Each test is expected to have its own
/// instance of `TestEnvironment`, as tests execute in parallel and so cannot share this object.
///
/// Most tests will begin by creating a `TestEnvironment` variable, and then make multiple calls to its different
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
    // The secrets to be used for light and contract account creation, as well as contract deployments. By keeping track
    // of the last used secret we can issue new ones automatically without requiring the user to provide different ones.
    //
    // Additionally, having the secrets be deterministic for each set of accounts and all concurrent tests results in
    // TXE being able to maximize cache usage and not have to recompute account addresses and contract artifacts, which
    // are relatively expensive operations.
    light_account_secret: Counter,
    contract_account_secret: Counter,
    contract_deployment_secret: Counter,
}

/// Configuration values for `TestEnvironment::private_context_opts`. Meant to be used by calling `new` and then
/// chaining methods setting each value, e.g.:
/// ```noir
/// env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(5), ...);
/// ```
pub struct PrivateContextOptions {
    contract_address: Option<AztecAddress>,
    anchor_block_number: Option<u32>,
}

impl PrivateContextOptions {
    /// Creates a new `PrivateContextOptions` with default values, i.e. the same as if using the `private_context`
    /// method instead of `private_context_opts`. Use the `at_anchor_block_number` and other methods to set the
    /// desired configuration values.
    pub fn new() -> Self {
        Self { contract_address: Option::none(), anchor_block_number: Option::none() }
    }

    /// Sets the desired anchor block number to base the private context in. Only past block numbers can be
    /// specified.
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
}

struct PublicContextOptions {
    contract_address: Option<AztecAddress>,
}

struct UtilityContextOptions {
    contract_address: Option<AztecAddress>,
}

struct NoteDiscoveryOptions {
    contract_address: Option<AztecAddress>,
}

impl TestEnvironment {
    /// Creates a new `TestEnvironment`. This function should only be called once per test.
    pub unconstrained fn new() -> Self {
        assert_compatible_oracle_version();
        Self {
            light_account_secret: Counter::new(),
            contract_account_secret: Counter::new(),
            contract_deployment_secret: Counter::new(),
        }
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
    /// `public_context`. Do **NOT** return the `PublicContext` from the callback function, or use it in any way outside
    /// of it - it becomes invalid once `public_context` returns.
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
    pub unconstrained fn public_context<Env, T>(
        self: Self,
        f: fn[Env](&mut PublicContext) -> T,
    ) -> T {
        self.public_context_opts(PublicContextOptions { contract_address: Option::none() }, f)
    }

    /// Variant of `public_context` which allows specifying the contract address in which the public context will
    /// execute, which will affect note and nullifier siloing, storage access, etc.
    pub unconstrained fn public_context_at<Env, T>(
        self: Self,
        addr: AztecAddress,
        f: fn[Env](&mut PublicContext) -> T,
    ) -> T {
        self.public_context_opts(PublicContextOptions { contract_address: Option::some(addr) }, f)
    }

    unconstrained fn public_context_opts<Env, T>(
        _self: Self,
        opts: PublicContextOptions,
        f: fn[Env](&mut PublicContext) -> T,
    ) -> T {
        txe_oracles::set_public_txe_context(opts.contract_address);

        let mut context = PublicContext::new(|| 0);
        let ret_value = f(&mut context);

        txe_oracles::set_top_level_txe_context();

        ret_value
    }

    /// Creates a `PrivateContext`, which allows using aztec-nr features as if inside a private contract function.
    /// Useful for low-level testing of private state variables and utilities.
    ///
    /// A new block is automatically mined once `private_context` returns, containing all of the side effects caused by
    /// its execution (e.g. note and nullifier emission). It is however **NOT** possible to make any contract calls from this
    /// private context, neither private nor enqueued public calls - use `call_private` and `call_public` for testing
    /// contract calls (though usage of these is forbidden while inside `private_context`).
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
    pub unconstrained fn private_context<Env, T>(
        self: Self,
        f: fn[Env](&mut PrivateContext) -> T,
    ) -> T {
        self.private_context_opts(
            PrivateContextOptions {
                contract_address: Option::none(),
                anchor_block_number: Option::none(),
            },
            f,
        )
    }

    /// Variant of `private_context` which allows specifying the contract address in which the private context will
    /// execute, which will affect note and nullifier siloing, storage access, etc.
    pub unconstrained fn private_context_at<Env, T>(
        self: Self,
        addr: AztecAddress,
        f: fn[Env](&mut PrivateContext) -> T,
    ) -> T {
        self.private_context_opts(
            PrivateContextOptions {
                contract_address: Option::some(addr),
                anchor_block_number: Option::none(),
            },
            f,
        )
    }

    /// Variant of `private_context` which allows specifying multiple configuration values via `PrivateContextOptions`.
    pub unconstrained fn private_context_opts<Env, T>(
        _self: Self,
        opts: PrivateContextOptions,
        f: fn[Env](&mut PrivateContext) -> T,
    ) -> T {
        let mut context = PrivateContext::new(
            txe_oracles::set_private_txe_context(opts.contract_address, opts.anchor_block_number),
            0,
        );

        let ret_value = f(&mut context);

        txe_oracles::set_top_level_txe_context();

        ret_value
    }

    /// Creates a `UtilityContext`, which allows using aztec-nr features as if inside a utility contract function.
    /// Useful for low-level testing of private and public state variable utilities.
    ///
    /// Receives a callback function which is called with the created `Utility` - this function is where testing
    /// logic is expected to reside. Any values returned by it are bubbled-up and returned to the caller of
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
    pub unconstrained fn utility_context<Env, T>(self: Self, f: fn[Env](UtilityContext) -> T) -> T {
        self.utility_context_opts(UtilityContextOptions { contract_address: Option::none() }, f)
    }

    /// Variant of `utility_context` which allows specifying the contract address in which the utility context will
    /// execute, which will affect note and storage access.
    pub unconstrained fn utility_context_at<Env, T>(
        self: Self,
        addr: AztecAddress,
        f: fn[Env](UtilityContext) -> T,
    ) -> T {
        self.utility_context_opts(UtilityContextOptions { contract_address: Option::some(addr) }, f)
    }

    unconstrained fn utility_context_opts<Env, T>(
        _self: Self,
        opts: UtilityContextOptions,
        f: fn[Env](UtilityContext) -> T,
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
    /// that timestamp (e.g. via `call_public` or `public_context`), and making it possible to create private executions
    /// at the specified timestamp (e.g. via `call_private` or `private_context`).
    pub unconstrained fn mine_block_at(self, timestamp: u64) {
        self.set_next_block_timestamp(timestamp);
        self.mine_block();
    }

    /// Sets the timestamp of the next block to be mined, causing followup public executions to occur at that timestamp
    /// (e.g. via `call_public` or `public_context`).
    pub unconstrained fn set_next_block_timestamp(self, timestamp: u64) {
        let pending_timestamp = txe_oracles::get_next_block_timestamp();
        assert(
            pending_timestamp <= timestamp,
            "Cannot go back in time. Timestamp cannot be before next timestamp.",
        );
        let difference: u64 = timestamp - pending_timestamp;
        self.advance_next_block_timestamp_by(difference);
    }

    /// Mines an empty block (i.e. with no transactions). Note that block timestamps do not automatically advance - this
    /// must be done by calling `mine_block_at` or `set_next_block_timestamp`.
    pub unconstrained fn mine_block(_self: Self) {
        txe_oracles::advance_blocks_by(1);
    }

    /// Sets the timestamp of the next block to be mined to be ahead of the last one by `duration`.
    pub unconstrained fn advance_next_block_timestamp_by(_self: Self, duration: u64) {
        txe_oracles::advance_timestamp_by(duration);
    }

    /// Creates a new account that can be used as the `from` parameter in contract calls, e.g. in `private_call` or
    /// `public_call`, or be made the owner or recipient of notes in `private_context`.
    ///
    /// The returned account has a full set of privacy keys, so it can nullify notes, receive messages, etc. It also has
    /// an associated `SchnorrAccount` contract that can process authwit requests - the authwits can be added via the
    /// `add_private_authwit_from_call_interface` and `add_public_authwit_from_call_interface` helper functions. If
    /// authwits are not required, consider using `create_light_account` instead, which is a faster variant of this
    /// function.
    ///
    /// Each call to `create_contract_account` will return a different address, and so it can be called repeatedly to
    /// generate multiple addresses. These addresses are also different from the ones that `create_light_account`
    /// returns, and so these two functions can be mixed and match to create a set of unique accounts.
    pub unconstrained fn create_contract_account(&mut self) -> AztecAddress {
        let test_account = txe_oracles::add_account(self.contract_account_secret.next());
        let address = test_account.address;

        let _ = self.call_private(
            AztecAddress::zero(),
            PrivateCallInterface::<_, ()>::new(
                address,
                comptime { FunctionSelector::from_signature("constructor(Field,Field)") },
                "constructor",
                [test_account.keys.ivpk_m.inner.x, test_account.keys.ivpk_m.inner.y],
                false,
            ),
        );

        address
    }

    /// Creates a new account that can be used as the `from` parameter in contract calls, e.g. in `private_call` or
    /// `public_call`, or be made the owner or recipient of notes in `private_context`. This is a faster variant of
    /// `create_contract_account`, but comes with reduced capabilities.
    ///
    /// The returned account has a full set of privacy keys, so it can nullify notes, receive messages, etc. It doesn't
    /// however have an associated account contract, so it cannot process private authwit requests. If calling contracts
    /// that rely on private authwits, use `create_contract_account` instead.
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
    /// In order to finalize the deployment, the proper initializer function must be specified via one of the associated
    /// methods. For more information on how to specify the path and initialization, read the sections below.
    ///
    /// ### Path
    /// Contracts can be deployed from either the same crate as the test, from a different crate in the same workspace,
    /// or from an altogether independent crate.
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
    /// If deploying contracts from a crate not in the workspace, use `path_to_crate/contract_name`, with the crate path
    /// relative to the current workspace:
    /// ```noir
    /// TestEnvironment::new().deploy("../my_other_crate/MyContract");
    /// ```
    ///
    /// ### Initialization
    /// If no initializer function needs to be called, use `without_initializer`:
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
        ContractDeployment { env: *self, path, secret: self.contract_deployment_secret.next() }
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
    /// The `call_interface` value can be obtained by calling the appropriate method on a contract type. E.g.:
    ///
    /// ```noir
    /// let caller = env.create_light_account();
    /// let contract_addr = env.deploy("SampleContract").without_initializer();
    /// let return_value = env.call_private(caller, SampleContract::at(contract_addr).sample_private_function());
    /// ```
    pub unconstrained fn call_private<T, let M: u32>(
        _self: Self,
        from: AztecAddress,
        call_interface: PrivateCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let args = call_interface.get_args();
        let args_hash = hash_args(args);

        let serialized_return_values = txe_oracles::private_call_new_flow(
            from,
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            args,
            args_hash,
            call_interface.get_is_static(),
        );

        T::deserialize(serialized_return_values)
    }

    /// Variant of `call_private` for private `#[view]` functions.
    ///
    /// Unlike `call_private`, no transaction is created and no block is mined (since `#[view]` functions are only
    /// executable in a static context, and these produce no side effects).
    pub unconstrained fn view_private<T, let M: u32>(
        _self: Self,
        call_interface: PrivateStaticCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let args = call_interface.get_args();
        let args_hash = hash_args(args);

        let serialized_return_values = txe_oracles::private_call_new_flow(
            std::mem::zeroed(), // The 'from' address is currently not manually set
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            args,
            args_hash,
            call_interface.get_is_static(),
        );

        T::deserialize(serialized_return_values)
    }

    /// Performs a utility contract function call and returns the result of the called function.
    ///
    /// The `call_interface` value can be obtained by calling the appropriate method on a contract type. E.g.:
    ///
    /// ```noir
    /// let caller = env.create_light_account();
    /// let contract_addr = env.deploy("SampleContract").without_initializer();
    /// let return_value = env.simulate_utility(SampleContract::at(contract_addr).sample_utility_function());
    /// ```
    pub unconstrained fn simulate_utility<T, let M: u32>(
        _self: Self,
        call_interface: UtilityCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::simulate_utility_function(
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
        );

        T::deserialize(serialized_return_values)
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
    /// The `call_interface` value can be obtained by calling the appropriate method on a contract type. E.g.:
    ///
    /// ```noir
    /// let caller = env.create_light_account();
    /// let contract_addr = env.deploy("SampleContract").without_initializer();
    /// let return_value = env.call_public(caller, SampleContract::at(contract_addr).sample_public_function());
    /// ```
    pub unconstrained fn call_public<T, let M: u32>(
        _self: Self,
        from: AztecAddress,
        call_interface: PublicCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::public_call_new_flow(
            from,
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            false,
        );

        T::deserialize(serialized_return_values)
    }

    /// Variant of `call_public` for public `#[view]` functions.
    ///
    /// Unlike `call_public`, no transaction is created and no block is mined (since `#[view]` functions are only
    /// executable in a static context, and these produce no side effects).
    pub unconstrained fn view_public<T, let M: u32>(
        _self: Self,
        call_interface: PublicStaticCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let serialized_return_values = txe_oracles::public_call_new_flow(
            AztecAddress::zero(),
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            true,
        );

        T::deserialize(serialized_return_values)
    }

    /// Discovers a note wrapped in a `NoteEmission` value, which is expected to have been created in the last
    /// transaction (typically via `private_context()`) so that it can be retrieved in later transactions. This mimics
    /// the normal note discovery process that takes places automatically in contracts.
    ///
    /// `NoteEmission` values are typically returned by aztec-nr state variables that create notes and need to notify a
    /// recipient of their existence. Instead of going through the message encoding, encryption and emission that would
    /// regularly take place in a contract, `discover_note` simply takes the `NoteEmission` and processes it as needed
    /// to discover the underlying note.
    ///
    /// See `discover_note_at` for a variant that allows specifying the contract address the note belongs to.
    ///
    /// ### Sample usage
    ///
    /// The most common way to invoke this function is to obtain an emission created during the execution of a
    /// `private_context`:
    ///
    /// ```noir
    /// let emission = env.private_context(|context| create_note(context, storage_slot, note));
    ///
    /// env.discover_note(emission);
    ///
    /// env.private_context(|context| { let (retrieved_note, _) = get_note::<MockNote>(context, storage_slot); });
    /// ```
    pub unconstrained fn discover_note<Note>(self: Self, emission: NoteEmission<Note>)
    where
        Note: Packable + NoteType + NoteHash,
    {
        self.discover_note_opts(NoteDiscoveryOptions { contract_address: Option::none() }, emission);
    }

    /// Variant of `discover_note` which allows specifying the contract address the note belongs to, which is required
    /// when the note was not emitted in the default address used by `private_context`.
    ///
    /// ```noir
    /// let emission = env.private_context_at(contract_address, |context| {
    ///     create_note(context, storage_slot, note)
    /// });
    ///
    /// env.discover_note_at(contract_address, emission);
    ///
    /// env.private_context_at(contract_address, |context| {
    ///     let (retrieved_note, _) = get_note::<MockNote>(context, storage_slot);
    /// });
    /// ```
    pub unconstrained fn discover_note_at<Note>(
        self: Self,
        addr: AztecAddress,
        emission: NoteEmission<Note>,
    )
    where
        Note: Packable + NoteType + NoteHash,
    {
        self.discover_note_opts(
            NoteDiscoveryOptions { contract_address: Option::some(addr) },
            emission,
        );
    }

    unconstrained fn discover_note_opts<Note>(
        self: Self,
        opts: NoteDiscoveryOptions,
        emission: NoteEmission<Note>,
    )
    where
        Note: Packable + NoteType + NoteHash,
    {
        // This function will emulate the message discovery and processing that would happen in a real contract, based
        // on a message created from the received note emission.

        // First we produce the message itself. We skip encryption/decryption since we're not interested in that here.
        // Note that we need to convert the fixed-size array produced by the encoding functions into a BoundedVec, which
        // is what the decoding functions expect (because they are built to manage protocol logs, which are arbitrarily
        // sized).
        let message_plaintext = BoundedVec::from_array(private_note_to_message_plaintext(
            emission.note,
            emission.storage_slot,
        ));

        // Then we fetch the transaction effects from the latest transaction, in which the note from the emission is
        // expected to have been created. In a real contract this data would have either been supplied by the
        // `process_message` caller, of retrieved along with the message from a tagged log.
        let (tx_hash, unique_note_hashes_in_tx, nullifiers_in_tx) =
            txe_oracles::get_last_tx_effects();

        // Real messages would also have a recipient, a concept which does not translate to anything in
        // `TestEnvironment` since it works with a single PXE with global scopes. We therefore simply set the zero
        // address as the recipient, which PXE accepts as a note scope despite this not being a registered account.
        let recipient = AztecAddress::zero();

        let message_context = MessageContext {
            tx_hash,
            unique_note_hashes_in_tx,
            first_nullifier_in_tx: nullifiers_in_tx.get(0),
            recipient,
        };

        // We also need to provide an implementation for the `compute_note_hash_and_nullifier` function, which would
        // typically be created by the macros for the different notes in a given contract. Here we build one specialized
        // for `Note`.
        let compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<_> = |packed_note, storage_slot, note_type_id, contract_address, note_nonce| {
            assert_eq(note_type_id, Note::get_id());
            assert_eq(packed_note.len(), <Note as Packable>::N);

            let note = Note::unpack(subarray(packed_note.storage(), 0));

            let note_hash = note.compute_note_hash(storage_slot);
            let note_hash_for_nullification = compute_note_hash_for_nullification(
                RetrievedNote {
                    note,
                    contract_address,
                    metadata: SettledNoteMetadata::new(note_nonce).into(),
                },
                storage_slot,
            );

            let inner_nullifier = note.compute_nullifier_unconstrained(note_hash_for_nullification);

            Option::some(NoteHashAndNullifier { note_hash, inner_nullifier })
        };

        // Both private and utility functions perform message processing and note discovery. We do it in an utility
        // context here as that one is more lightweight and does not create new blocks, which also allows for
        // `discover_notes` to be called repeatedly with multiple emissions from the same transaction.
        self.utility_context_opts(
            UtilityContextOptions { contract_address: opts.contract_address },
            |context| {
                process_message_plaintext(
                    context.this_address(),
                    compute_note_hash_and_nullifier,
                    message_plaintext,
                    message_context,
                );

                validate_enqueued_notes_and_events(context.this_address());
            },
        );
    }
}
