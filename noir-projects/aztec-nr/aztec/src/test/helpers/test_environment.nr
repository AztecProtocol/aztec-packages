use protocol_types::{
    abis::function_selector::FunctionSelector, address::AztecAddress, traits::Deserialize,
};

use crate::{
    context::{
        call_interfaces::CallInterface, PrivateCallInterface, PrivateContext,
        PrivateStaticCallInterface, PublicCallInterface, PublicContext, PublicStaticCallInterface,
        ReturnsHash, UtilityCallInterface, UtilityContext,
    },
    hash::hash_args,
    oracle::{execution::{get_block_number, get_timestamp}, execution_cache},
    test::helpers::{txe_oracles, utils::Deployer},
};

use super::txe_oracles::public_call_new_flow;

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

pub struct TestEnvironment {
    // The secrets to be used for light and contract account creation. By keeping track of the last used secret we can
    // issue new ones automatically without requiring the user to provide different ones. Additionally, having the
    // secrets be deterministic for each set of accounts and all concurrent tests results in TXE being able to maximize
    // cache usage and not have to recompute account addresses and contract artifacts, which are relatively expensive
    // operations.
    light_account_secret: Counter,
    contract_account_secret: Counter,
}

pub struct CallResult<T> {
    pub return_value: T,
    pub tx_hash: Field,
}

pub struct PrivateContextOptions {
    contract_address: Option<AztecAddress>,
    historical_block_number: Option<u32>,
}

impl PrivateContextOptions {
    pub fn new() -> Self {
        Self { contract_address: Option::none(), historical_block_number: Option::none() }
    }

    pub fn at_historical_block_number(&mut self, historical_block_number: u32) -> Self {
        self.historical_block_number = Option::some(historical_block_number);
        *self
    }

    pub fn at_contract_address(&mut self, contract_address: AztecAddress) -> Self {
        self.contract_address = Option::some(contract_address);
        *self
    }
}

impl TestEnvironment {
    pub unconstrained fn new() -> Self {
        Self { light_account_secret: Counter::new(), contract_account_secret: Counter::new() }
    }

    pub unconstrained fn _new() -> Self {
        txe_oracles::enable_context_checks();
        Self { light_account_secret: Counter::new(), contract_account_secret: Counter::new() }
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
    pub unconstrained fn public_context<Env, T>(
        _self: Self,
        f: fn[Env](&mut PublicContext) -> T,
    ) -> T {
        txe_oracles::set_public_txe_context();

        let mut context = PublicContext::new(|| 0);
        let ret_value = f(&mut context);

        // merge calls below into 'exit public txe context' -> this mines a block
        txe_oracles::advance_blocks_by(1);
        txe_oracles::set_top_level_txe_context();

        ret_value
    }

    pub unconstrained fn public_context_at<Env, T>(
        self,
        addr: AztecAddress,
        f: fn[Env](&mut PublicContext) -> T,
    ) -> T {
        // temporary hack until we reimplement the public context oracle and have it take this as a param
        let pre = txe_oracles::get_contract_address();
        txe_oracles::set_contract_address(addr);
        let ret = self.public_context(f);
        txe_oracles::set_contract_address(pre);

        ret
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
    pub unconstrained fn private_context<Env, T>(self, f: fn[Env](&mut PrivateContext) -> T) -> T {
        // merge the two oracles below - the creation of a context implies a transition to a private txe context. right
        // now we have them in this order because creating the private context requires reading the latest block number,
        // which we only allow for top level and utility
        let mut context = PrivateContext::new(
            txe_oracles::get_private_context_inputs(Option::some(self.last_block_number())),
            0,
        );
        txe_oracles::set_private_txe_context();

        let ret_value = f(&mut context);
        txe_oracles::set_top_level_txe_context();

        // todo: should commit the context to mine a block with the side effects of the context. we should have an
        // oracle that receives the context we produced probably
        self.mine_block();

        ret_value
    }

    pub unconstrained fn private_context_at<Env, T>(
        self,
        addr: AztecAddress,
        f: fn[Env](&mut PrivateContext) -> T,
    ) -> T {
        // temporary hack until we reimplement the public context oracle and have it take this as a param
        let pre = txe_oracles::get_contract_address();
        txe_oracles::set_contract_address(addr);
        let ret = self.private_context(f);
        txe_oracles::set_contract_address(pre);

        ret
    }

    pub unconstrained fn private_context_opts<Env, T>(
        self,
        opts: PrivateContextOptions,
        f: fn[Env](&mut PrivateContext) -> T,
    ) -> T {
        // temporary hack until we reimplement the public context oracle and have it take this as a param

        let pre_contract_address = txe_oracles::get_contract_address();

        if opts.contract_address.is_some() {
            txe_oracles::set_contract_address(opts.contract_address.unwrap());
        }

        // merge the two oracles below - the creation of a context implies a transition to a private txe context. right
        // now we have them in this order because creating the private context requires reading the latest block number,
        // which we only allow for top level and utility
        let mut context = PrivateContext::new(
            txe_oracles::get_private_context_inputs(opts.historical_block_number.or_else(|| {
                Option::some(self.last_block_number())
            })),
            0,
        );

        txe_oracles::set_private_txe_context();

        let ret_value = f(&mut context);
        txe_oracles::set_top_level_txe_context();

        // todo: should commit the context to mine a block with the side effects of the context. we should have an
        // oracle that receives the context we produced probably
        self.mine_block();

        txe_oracles::set_contract_address(pre_contract_address);

        ret_value
    }

    /// EXPERIMENTAL FEATURE - NOT MEANT FOR EXTERNAL USE
    pub unconstrained fn utility_context<Env, T>(
        _self: Self,
        f: fn[Env](UtilityContext) -> T,
    ) -> T {
        txe_oracles::set_utility_txe_context();
        let context = UtilityContext::new();
        let ret_value = f(context);
        txe_oracles::set_top_level_txe_context();

        ret_value
    }

    pub unconstrained fn utility_context_at<Env, T>(
        self,
        addr: AztecAddress,
        f: fn[Env](UtilityContext) -> T,
    ) -> T {
        // temporary hack until we reimplement the utility context oracle and have it take this as a param
        let pre = txe_oracles::get_contract_address();
        txe_oracles::set_contract_address(addr);
        let ret = self.utility_context(f);
        txe_oracles::set_contract_address(pre);

        ret
    }

    /// Returns the number of the next block to be built.
    pub unconstrained fn next_block_number(_self: Self) -> u32 {
        get_block_number()
    }

    /// Returns the number of the last mined block. This is the default historical block for private transactions.
    pub unconstrained fn last_block_number(_self: Self) -> u32 {
        get_block_number() - 1
    }

    pub unconstrained fn last_block_timestamp(_self: Self) -> u64 {
        txe_oracles::get_last_block_timestamp()
    }

    pub unconstrained fn mine_block_at(self, timestamp: u64) {
        self.set_next_block_timestamp(timestamp);
        self.mine_block();
    }

    /// Advances the internal TXe timestamp to the specified timestamp.
    pub unconstrained fn set_next_block_timestamp(self, timestamp: u64) {
        let pending_timestamp = get_timestamp();
        assert(
            pending_timestamp <= timestamp,
            "Cannot go back in time. Timestamp cannot be before next timestamp.",
        );
        let difference: u64 = timestamp - pending_timestamp;
        self.advance_next_block_timestamp_by(difference);
    }

    /// Advances the internal TXe state by one valid block.
    pub unconstrained fn mine_block(_self: Self) {
        txe_oracles::advance_blocks_by(1);
    }

    /// Advances the internal TXe timestamp by the specified duration in seconds.
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
    /// however have an associated account contract, so it cannot process private authwit requests.
    ///
    /// Each call to `create_light_account` will return a different address, and so it can be called repeatedly to
    /// generate multiple addresses. These addresses are also different from the ones that `create_contract_account`
    /// returns, and so these two functions can be mixed and match to create a set of unique accounts.
    pub unconstrained fn create_light_account(&mut self) -> AztecAddress {
        let test_account = txe_oracles::create_account(self.light_account_secret.next());
        test_account.address
    }

    pub unconstrained fn deploy<let N: u32, let M: u32>(
        self: Self,
        path: str<N>,
        name: str<M>,
    ) -> Deployer<N, M> {
        Deployer { env: self, path, name, secret: 0 }
    }

    pub unconstrained fn deploy_self<let M: u32>(self: Self, name: str<M>) -> Deployer<0, M> {
        Deployer { env: self, path: "", name, secret: 0 }
    }

    pub unconstrained fn call_private<T, let M: u32>(
        _self: Self,
        from: AztecAddress,
        call_interface: PrivateCallInterface<M, T>,
    ) -> CallResult<T>
    where
        T: Deserialize,
    {
        let args = call_interface.get_args();
        let args_hash = hash_args(args);

        let (_end_side_effect_counter, returns_hash, tx_hash) = txe_oracles::private_call_new_flow(
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

    pub unconstrained fn view_private<T, let M: u32>(
        _self: Self,
        call_interface: PrivateStaticCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let args = call_interface.get_args();
        let args_hash = hash_args(args);

        let (_end_side_effect_counter, returns_hash, _) = txe_oracles::private_call_new_flow(
            std::mem::zeroed(), // The 'from' address is currently not manually set
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            args,
            args_hash,
            call_interface.get_is_static(),
        );

        let returns: T = ReturnsHash::new(returns_hash).get_preimage();
        returns
    }

    pub unconstrained fn simulate_utility<T, let M: u32>(
        _self: Self,
        call_interface: UtilityCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
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

    pub unconstrained fn call_public<T, let M: u32>(
        _self: Self,
        from: AztecAddress,
        call_interface: PublicCallInterface<M, T>,
    ) -> CallResult<T>
    where
        T: Deserialize,
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

    pub unconstrained fn view_public<T, let M: u32>(
        _self: Self,
        call_interface: PublicStaticCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let (returns_hash, _) = public_call_new_flow(
            AztecAddress::zero(),
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            true,
        );

        // This shouldn't be using ReturnsHash, but I don't think CalldataHash is right either in this context
        let returns: T = ReturnsHash::new(returns_hash).get_preimage();
        returns
    }
}
