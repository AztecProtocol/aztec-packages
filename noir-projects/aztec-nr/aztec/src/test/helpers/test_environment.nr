use protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::PUBLIC_DISPATCH_SELECTOR,
    traits::{Deserialize, FromField, Packable, ToField},
};

use crate::{
    context::{
        call_interfaces::{
            CallInterface, TXEPrivateCallInterface, TXEPublicCallInterface, TXEUtilityCallInterface,
        },
        PrivateCallInterface,
        PrivateContext,
        PrivateVoidCallInterface,
        PublicCallInterface,
        PublicContext,
        PublicVoidCallInterface,
        ReturnsHash,
        UtilityCallInterface,
        UtilityContext,
    },
    hash::hash_args,
    note::note_interface::{NoteHash, NoteType},
    oracle::{
        execution::{get_block_number, get_contract_address, get_timestamp},
        execution_cache,
        notes::notify_created_note,
    },
    test::helpers::{cheatcodes, utils::Deployer},
};

use super::cheatcodes::public_call_new_flow;

mod test;

pub struct TestEnvironment {}

pub struct CallResult<T> {
    pub return_value: T,
    pub tx_hash: Field,
}

impl TestEnvironment {
    pub unconstrained fn new() -> Self {
        cheatcodes::reset();
        Self {}
    }

    pub unconstrained fn _new() -> Self {
        cheatcodes::reset();
        cheatcodes::enable_context_checks();
        Self {}
    }

    /// EXPERIMENTAL FEATURE - NOT MEANT FOR EXTERNAL USE
    ///
    /// Creates a `PublicContext`, which allows using aztec-nr features as if inside a public contract function. Useful
    /// for low-level testing of public state variables and utilities.
    ///
    /// Receives a function which is called with the created `PublicContext`. Any value returned by said function is
    /// bubbled up to the caller of `public_context`. Do *NOT* return or use the `PublicContext` value in any way
    /// outside of the passed function, since it will become invalid once `public_context` returns.
    ///
    /// A new block is automatically mined once `public_context` returns, containing all of the side-effects caused by
    /// its execution (e.g. public storage writes).
    ///
    /// ---
    /// Sample usage:
    /// ```noir
    /// env.public_context(|context| {
    ///   let state_var = PublicMutable::new(context, STORAGE_SLOT);
    ///   state_var.write(some_value);
    ///   assert_eq(state_var.read(), some_value);
    /// });
    /// ```
    ///
    /// ---
    /// Advanced usage with returns:
    /// ```noir
    /// let read_value = env.public_context(|context| {
    ///   let state_var = PublicMutable::new(context, STORAGE_SLOT);
    ///   state_var.read()
    /// });
    pub unconstrained fn public_context<Env, T>(self, f: fn[Env](&mut PublicContext) -> T) -> T {
        cheatcodes::set_public_txe_context();

        let mut context = self.public();
        let ret_value = f(&mut context);

        // merge calls below into 'exit public txe context' -> this mines a block
        // 36 is the slot duration - for some reason we need to advance by at least this much in order to get a block to
        // get mined. note that this may cause the block we just mined to not have the timestamp we thought it did - we
        // need to test this.
        cheatcodes::advance_timestamp_by(36);
        cheatcodes::advance_blocks_by(1);
        cheatcodes::set_top_level_txe_context();

        ret_value
    }

    /// EXPERIMENTAL FEATURE - NOT MEANT FOR EXTERNAL USE
    ///
    /// Creates a `PrivateContext`, which allows using aztec-nr features as if inside a private contract function.
    /// Useful for low-level testing of public state variables and utilities.
    ///
    /// Receives a function which is called with the created `PrivateContext`. Any value returned by said function is
    /// bubbled up to the caller of `private_context`. Do *NOT* return or use the `PrivateContext` value in any way
    /// outside of the passed function, since it will become invalid once `private_context` returns.
    ///
    /// The historical block is set to the latest block.
    pub unconstrained fn private_context<Env, T>(
        &mut self,
        f: fn[Env](&mut PrivateContext) -> T,
    ) -> T {
        // merge the two oracles below - the creation of a context implies a transition to a private txe context. right
        // now we have them in this order because creating the private context requires reading the latest block number,
        // which we only allow for top level and utility
        let mut context = self.private();
        cheatcodes::set_private_txe_context();

        let ret_value = f(&mut context);
        cheatcodes::set_top_level_txe_context();

        // todo: should commit the context to mine a block with the side effects of the context. we should have an
        // oracle that receives the context we produced probably
        self.mine_block();

        ret_value
    }

    /// EXPERIMENTAL FEATURE - NOT MEANT FOR EXTERNAL USE
    pub unconstrained fn utility_context<Env, T>(&mut self, f: fn[Env](UtilityContext) -> T) -> T {
        cheatcodes::set_utility_txe_context();
        let context = self.utility();
        let ret_value = f(context);
        cheatcodes::set_top_level_txe_context();

        ret_value
    }

    /// Returns the number of the next block to be built.
    pub unconstrained fn next_block_number(_self: Self) -> u32 {
        get_block_number()
    }

    /// Returns the number of the last mined block. This is the default historical block for private transactions.
    pub unconstrained fn last_block_number(_self: Self) -> u32 {
        get_block_number() - 1
    }

    /// With TXe tests, every test is run in a mock "contract". This facilitates the ability to write to and read from storage,
    /// emit and retrieve nullifiers (because they are hashed with a contract address), and formulate notes in a canonical way.
    /// The contract_address also represents the "msg_sender" when we call a contract with a private or public context; and when
    /// we call utility functions, we must set this contract address to the contract being called.
    /// The contract address can be manipulated to do the above at any particular address, and not simply the one provided at
    /// the instantiation of the test.
    /// Returns the currently set contract address.
    pub unconstrained fn contract_address(_self: Self) -> AztecAddress {
        get_contract_address()
    }

    /// Modifies the currently set contract address. As per above, it sets the "msg_sender" address on our subsequent calls.
    /// This is useful when we have multiple "accounts" that need to interact with an arbitrary contract. This also allows
    /// us to change the "contract" we emit side effects from, and is required when we want to run a utility function
    /// on another contract.
    pub unconstrained fn impersonate(_self: Self, address: AztecAddress) {
        cheatcodes::set_contract_address(address)
    }

    pub unconstrained fn mine_block_at(&mut self, timestamp: u64) {
        self.set_next_block_timestamp(timestamp);
        self.mine_block();
    }

    /// Advances the internal TXe timestamp to the specified timestamp.
    pub unconstrained fn set_next_block_timestamp(&mut self, timestamp: u64) {
        let pending_timestamp = get_timestamp();
        assert(
            pending_timestamp <= timestamp,
            "Cannot go back in time. Timestamp cannot be before next timestamp.",
        );
        let difference: u64 = timestamp - pending_timestamp;
        self.advance_next_block_timestamp_by(difference);
    }

    /// Advances the internal TXe state by one valid block.
    pub unconstrained fn mine_block(_self: &mut Self) {
        cheatcodes::advance_blocks_by(1);
    }

    /// Advances the internal TXe timestamp by the specified duration in seconds.
    pub unconstrained fn advance_next_block_timestamp_by(_self: &mut Self, duration: u64) {
        cheatcodes::advance_timestamp_by(duration);
    }

    /// Instantiates a public context. The block number returned from public_context.block_number() will be the
    /// block number of the block currently being built (same as the one returned by self.next_block_number()).
    pub unconstrained fn public(_self: Self) -> PublicContext {
        PublicContext::new(|| 0)
    }

    pub unconstrained fn public_with_args_hash(_self: Self, args: [Field]) -> PublicContext {
        let mut context = PublicContext::new(|| panic(f"Provide args hash manually"));
        context.args_hash = Option::some(hash_args(args));
        context
    }

    /// Instantiates a private context at the latest committed block number - this is the block number that gets used
    /// in production to build transactions when your PXE managed to successfully sync to the tip of the chain.
    pub unconstrained fn private(&mut self) -> PrivateContext {
        self.private_at(self.last_block_number())
    }

    pub unconstrained fn utility(_self: Self) -> UtilityContext {
        UtilityContext::new()
    }

    /// Instantiates a private context at a specific historical block number.
    pub unconstrained fn private_at(&mut self, historical_block_number: u32) -> PrivateContext {
        if historical_block_number > self.next_block_number() {
            cheatcodes::advance_blocks_by(1 + historical_block_number - self.next_block_number())
        }

        let mut inputs = cheatcodes::get_private_context_inputs_at_block(historical_block_number);

        PrivateContext::new(inputs, 0)
    }

    pub unconstrained fn create_account(_self: Self, secret: Field) -> AztecAddress {
        let test_account = cheatcodes::create_account(secret);
        test_account.address
    }

    pub unconstrained fn create_account_contract(&mut self, secret: Field) -> AztecAddress {
        let test_account = cheatcodes::add_account(secret);
        let address = test_account.address;

        let selector = FunctionSelector::from_signature("constructor(Field,Field)");

        let mut context = self.private_at(get_block_number());
        let args = [test_account.keys.ivpk_m.inner.x, test_account.keys.ivpk_m.inner.y];
        let _ = context.call_private_function(address, selector, args);

        cheatcodes::advance_blocks_by(1);

        address
    }

    pub unconstrained fn deploy<let N: u32, let M: u32>(
        _self: Self,
        path: str<N>,
        name: str<M>,
    ) -> Deployer<N, M> {
        Deployer { path, name, secret: 0 }
    }

    pub unconstrained fn deploy_self<let M: u32>(_self: Self, name: str<M>) -> Deployer<0, M> {
        Deployer { path: "", name, secret: 0 }
    }

    // Deploying with public keys assumes secret != 0
    pub unconstrained fn deploy_with_public_keys<let N: u32, let M: u32>(
        _self: Self,
        path: str<N>,
        name: str<M>,
        secret: Field,
    ) -> Deployer<N, M> {
        Deployer { path, name, secret }
    }

    pub unconstrained fn deploy_self_with_public_keys<let M: u32>(
        _self: Self,
        name: str<M>,
        secret: Field,
    ) -> Deployer<0, M> {
        Deployer { path: "", name, secret }
    }

    pub unconstrained fn assert_public_call_fails<C, let M: u32>(_self: Self, call_interface: C)
    where
        C: CallInterface<M>,
    {
        // Public functions are routed through the dispatch function.
        let fn_selector = FunctionSelector::from_field(PUBLIC_DISPATCH_SELECTOR);
        let calldata =
            &[call_interface.get_selector().to_field()].append(call_interface.get_args());
        cheatcodes::assert_public_call_fails(
            call_interface.get_contract_address(),
            fn_selector,
            calldata,
        );
    }

    pub unconstrained fn assert_private_call_fails<C, let M: u32>(_self: Self, call_interface: C)
    where
        C: CallInterface<M>,
    {
        cheatcodes::assert_private_call_fails(
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            hash_args(call_interface.get_args()),
            cheatcodes::get_side_effects_counter() as Field,
            call_interface.get_is_static(),
        );
    }

    pub unconstrained fn call_private<T, let N: u32, let M: u32>(
        _self: Self,
        from: AztecAddress,
        call_interface: PrivateCallInterface<M, T, N>,
    ) -> CallResult<T>
    where
        T: Deserialize<N>,
    {
        let args = call_interface.get_args();
        let args_hash = hash_args(args);

        let (_end_side_effect_counter, returns_hash, tx_hash) = cheatcodes::private_call_new_flow(
            from,
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            args,
            args_hash,
            call_interface.get_is_static(),
        );

        let returns: T = ReturnsHash::new(returns_hash).get_preimage();
        CallResult { return_value: returns, tx_hash }
    }

    pub unconstrained fn call_private_void<let M: u32, T, let N: u32>(
        _self: Self,
        from: AztecAddress,
        call_interface: PrivateVoidCallInterface<M, T, N>,
    ) -> CallResult<()> {
        let args = call_interface.get_args();
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);

        let (_end_side_effect_counter, returns_hash, tx_hash) = cheatcodes::private_call_new_flow(
            from,
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            args,
            args_hash,
            call_interface.get_is_static(),
        );

        ReturnsHash::new(returns_hash).assert_empty();

        CallResult { return_value: (), tx_hash }
    }

    pub unconstrained fn simulate_utility<T, let N: u32, let M: u32>(
        _self: Self,
        call_interface: UtilityCallInterface<M, T, N>,
    ) -> T
    where
        T: Deserialize<N>,
    {
        let args = call_interface.get_args();
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);

        let returns_hash = crate::oracle::simulate_utility_function::simulate_utility_function(
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            args_hash,
        );

        let returns: T = ReturnsHash::new(returns_hash).get_preimage();
        returns
    }

    pub unconstrained fn simulate_void_utility<T, let N: u32, let M: u32>(
        _self: Self,
        call_interface: UtilityCallInterface<M, T, N>,
    ) {
        let args = call_interface.get_args();
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);

        let returns_hash = crate::oracle::simulate_utility_function::simulate_utility_function(
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            args_hash,
        );

        ReturnsHash::new(returns_hash).assert_empty();
    }

    pub unconstrained fn call_public<T, let N: u32, let M: u32>(
        _self: Self,
        from: AztecAddress,
        call_interface: PublicCallInterface<M, T, N>,
    ) -> CallResult<T>
    where
        T: Deserialize<N>,
    {
        let (returns_hash, tx_hash) = public_call_new_flow(
            from,
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            false,
        );

        // This shouldn't be using ReturnsHash, but I don't think CalldataHash is right either in this context
        let returns: T = ReturnsHash::new(returns_hash).get_preimage();
        CallResult { return_value: returns, tx_hash }
    }

    pub unconstrained fn call_public_void<T, let N: u32, let M: u32>(
        _self: Self,
        from: AztecAddress,
        call_interface: PublicVoidCallInterface<M, T, N>,
    ) -> CallResult<()> {
        let (returns_hash, tx_hash) = public_call_new_flow(
            from,
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            false,
        );

        ReturnsHash::new(returns_hash).assert_empty();

        CallResult { return_value: (), tx_hash }
    }

    pub unconstrained fn call_private_test<T, let N: u32, let M: u32, X>(
        _self: Self,
        from: AztecAddress,
        call_interface: X,
    ) -> CallResult<T>
    where
        X: TXEPrivateCallInterface<T, N>,
        X: CallInterface<M>,
    {
        let (returns, tx_hash) = call_interface.call_with_txe(from);

        CallResult { return_value: returns, tx_hash }
    }

    pub unconstrained fn simulate_utility_test<T, let N: u32, let M: u32, X>(
        _self: Self,
        call_interface: X,
    ) -> T
    where
        X: TXEUtilityCallInterface<T, N>,
        X: CallInterface<M>,
    {
        let returns = call_interface.call_with_txe();

        returns
    }

    pub unconstrained fn call_public_test<T, let N: u32, let M: u32, X>(
        _self: Self,
        from: AztecAddress,
        call_interface: X,
    ) -> CallResult<T>
    where
        X: TXEPublicCallInterface<T, N>,
        X: CallInterface<M>,
    {
        let (returns, tx_hash) = call_interface.call_with_txe(from);

        CallResult { return_value: returns, tx_hash }
    }

    /// Manually adds a note to TXE. This needs to be called if you want to work with a note in your test with the note
    /// not having an encrypted log emitted.
    pub unconstrained fn add_note<Note, let N: u32>(
        _self: Self,
        note: Note,
        storage_slot: Field,
        contract_address: AztecAddress,
    )
    where
        Note: NoteType + NoteHash + Packable<N>,
    {
        let original_contract_address = get_contract_address();
        cheatcodes::set_contract_address(contract_address);
        let note_hash_counter = cheatcodes::get_side_effects_counter();

        let note_hash = note.compute_note_hash(storage_slot);
        let packed_note = Note::pack(note);
        notify_created_note(
            storage_slot,
            Note::get_id(),
            packed_note,
            note_hash,
            note_hash_counter,
        );
        cheatcodes::set_contract_address(original_contract_address);
    }
}
