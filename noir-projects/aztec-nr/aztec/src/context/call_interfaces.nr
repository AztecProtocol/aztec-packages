use dep::protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    traits::{Deserialize, ToField},
};

use crate::context::{gas::GasOpts, private_context::PrivateContext, public_context::PublicContext};
use crate::hash::{hash_args, hash_calldata};
use crate::oracle::execution_cache;

pub trait CallInterface<let N: u32> {
    fn get_args(self) -> [Field];
    fn get_selector(self) -> FunctionSelector;
    fn get_name(self) -> str<N>;
    fn get_contract_address(self) -> AztecAddress;
    fn get_is_static(self) -> bool;
}

// PrivateCallInterface

pub struct PrivateCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args_hash: Field,
    args: [Field],
    return_type: T,
    is_static: bool,
}

impl<let M: u32, T> PrivateCallInterface<M, T>
where
    T: Deserialize,
{
    pub fn new(
        target_contract: AztecAddress,
        selector: FunctionSelector,
        name: str<M>,
        args: [Field],
        is_static: bool,
    ) -> Self {
        let args_hash = hash_args(args);
        Self {
            target_contract,
            selector,
            name,
            args_hash,
            args,
            return_type: std::mem::zeroed(),
            is_static,
        }
    }

    /// Makes the call to this private function.
    ///
    /// # Arguments
    /// * `context` - The PrivateContext -- made magically available to the body
    ///               of every #[private] function as `context`, through the
    ///               #[private] annotation's macro.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    /// This enables contracts to interact with each other while maintaining
    /// privacy. This "composability" of private contract functions is a key
    /// feature of the Aztec network.
    ///
    /// If a user's transaction includes multiple private function calls, then
    /// by the design of Aztec, the following information will remain private[1]:
    /// - The function selectors and contract addresses of all private function
    ///   calls will remain private, so an observer of the public mempool will
    ///   not be able to look at a tx and deduce which private functions have
    ///   been executed.
    /// - The arguments and return values of all private function calls will
    ///   remain private.
    /// - The person who initiated the tx will remain private.
    /// - The notes and nullifiers and private logs that are emitted by all
    ///   private function calls will (if designed well) not leak any user
    ///   secrets, nor leak which functions have been executed.
    ///
    /// [1] Caveats: Some of these privacy guarantees depend on how app
    /// developers design their smart contracts. Some actions _can_ leak
    /// information, such as:
    /// - Calling an internal public function.
    /// - Calling a public function and not setting msg_sender to Option::none
    ///   (see https://github.com/AztecProtocol/aztec-packages/pull/16433)
    /// - Calling any public function will always leak details about the nature
    ///   of the transaction, so devs should be careful in their contract
    ///   designs. If it can be done in a private function, then that will give
    ///   the best privacy.
    /// - Not padding the side-effects of a tx to some standardised, uniform
    ///   size. The kernel circuits can take hints to pad side-effects, so a
    ///   wallet should be able to request for a particular amount of padding.
    ///   Wallets should ideally agree on some standard.
    ///   - Padding should include:
    ///     - Padding the lengths of note & nullifier arrays
    ///     - Padding private logs with random fields, up to some standardised
    ///       size.
    /// See also: https://docs.aztec.network/developers/reference/considerations/privacy_considerations
    ///
    /// # Advanced
    /// * The call is added to the private call stack and executed by kernel
    ///   circuits after this function completes
    /// * The called function can modify its own contract's private state
    /// * Side effects from the called function are included in this transaction
    /// * The call inherits the current transaction's context and gas limits
    ///
    /// # Arguments
    /// * `context` - The PrivateContext -- made magically available to the body
    ///               of every #[private] function as `context`, through the
    ///               #[private] annotation's macro.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    pub fn call(self, context: &mut PrivateContext) -> T {
        execution_cache::store(self.args, self.args_hash);
        let returns_hash = context.call_private_function_with_args_hash(
            self.target_contract,
            self.selector,
            self.args_hash,
            false,
        );

        // If T is () (i.e. if the function does not return anything) then `get_preimage` will constrain that the
        // returns hash is empty as per the protocol rules.
        returns_hash.get_preimage()
    }

    /// Makes a _read-only_ call to this private function.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state, emit L2->L1 messages, nor emit events. Any nested
    /// calls are constrained to also be staticcalls.
    ///
    /// See `call` for more general info on private function calls.
    ///
    /// # Arguments
    /// * `context` - The PrivateContext -- made magically available to the body
    ///               of every #[private] function as `context`, through the
    ///               #[private] annotation's macro.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    pub fn view(self, context: &mut PrivateContext) -> T {
        execution_cache::store(self.args, self.args_hash);
        let returns_hash = context.call_private_function_with_args_hash(
            self.target_contract,
            self.selector,
            self.args_hash,
            true,
        );
        // If T is () (i.e. if the function does not return anything) then `get_preimage` will constrain that the
        // returns hash is empty as per the protocol rules.
        returns_hash.get_preimage()
    }
}

impl<let M: u32, T> CallInterface<M> for PrivateCallInterface<M, T> {
    fn get_args(self) -> [Field] {
        self.args
    }

    fn get_selector(self) -> FunctionSelector {
        self.selector
    }

    fn get_name(self) -> str<M> {
        self.name
    }

    fn get_contract_address(self) -> AztecAddress {
        self.target_contract
    }

    fn get_is_static(self) -> bool {
        self.is_static
    }
}

// PrivateStaticCallInterface

pub struct PrivateStaticCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args_hash: Field,
    args: [Field],
    return_type: T,
    is_static: bool,
}

impl<let M: u32, T> PrivateStaticCallInterface<M, T> {
    pub fn new(
        target_contract: AztecAddress,
        selector: FunctionSelector,
        name: str<M>,
        args: [Field],
    ) -> Self {
        let args_hash = hash_args(args);
        Self {
            target_contract,
            selector,
            name,
            args_hash,
            args,
            return_type: std::mem::zeroed(),
            is_static: true,
        }
    }

    /// Makes a read-only call to this private function.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state, emit L2->L1 messages, nor emit events. Any nested
    /// calls are constrained to also be staticcalls.
    ///
    /// # Arguments
    /// * `context` - The PrivateContext -- made magically available to the body
    ///               of every #[private] function as `context`, through the
    ///               #[private] annotation's macro.
    ///
    pub fn view(self, context: &mut PrivateContext) -> T
    where
        T: Deserialize,
    {
        execution_cache::store(self.args, self.args_hash);
        let returns = context.call_private_function_with_args_hash(
            self.target_contract,
            self.selector,
            self.args_hash,
            true,
        );
        returns.get_preimage()
    }
}

impl<let M: u32, T> CallInterface<M> for PrivateStaticCallInterface<M, T> {
    fn get_args(self) -> [Field] {
        self.args
    }

    fn get_selector(self) -> FunctionSelector {
        self.selector
    }

    fn get_name(self) -> str<M> {
        self.name
    }

    fn get_contract_address(self) -> AztecAddress {
        self.target_contract
    }

    fn get_is_static(self) -> bool {
        self.is_static
    }
}

// PublicCallInterface

pub struct PublicCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args: [Field],
    gas_opts: GasOpts,
    return_type: T,
    is_static: bool,
}

impl<let M: u32, T> PublicCallInterface<M, T>
where
    T: Deserialize,
{
    pub fn new(
        target_contract: AztecAddress,
        selector: FunctionSelector,
        name: str<M>,
        args: [Field],
        is_static: bool,
    ) -> Self {
        Self {
            target_contract,
            selector,
            name,
            args,
            gas_opts: GasOpts::default(),
            return_type: std::mem::zeroed(),
            is_static,
        }
    }

    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    /// Makes the call to this public function.
    ///
    /// Will revert if the called function reverts or runs out of gas.
    ///
    /// # Arguments
    /// * `context` - The PublicContext -- made magically available to the body
    ///               of every #[public] function as `context`, through the
    ///               #[public] annotation's macro.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    pub unconstrained fn call(self, context: &mut PublicContext) -> T {
        let returns = context.call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        // If T is () (i.e. if the function does not return anything) then `as_array` will constrain that `returns` has
        // a length of 0 (since that is ()'s deserialization length).
        Deserialize::deserialize(returns.as_array())
    }

    /// Makes a read-only call to this public function.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state or emit events. Any nested calls are constrained to
    /// also be staticcalls.
    ///
    /// Will revert if the called function reverts or runs out of gas.
    ///
    /// # Arguments
    /// * `context` - The PublicContext -- made magically available to the body
    ///               of every #[public] function as `context`, through the
    ///               #[public] annotation's macro.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    pub unconstrained fn view(self, context: &mut PublicContext) -> T {
        let returns = context.static_call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        // If T is () (i.e. if the function does not return anything) then `as_array` will constrain that `returns` has
        // a length of 0 (since that is ()'s deserialization length).
        Deserialize::deserialize(returns.as_array())
    }

    /// Enqueues a call to this public function, to be executed later.
    ///
    /// Unlike private functions which execute immediately on the user's device,
    /// public function calls are "enqueued" and executed some time later by a
    /// block proposer.
    ///
    /// This means a public function cannot return any values back to a private
    /// function, because by the time the public function is being executed,
    /// the private function which called it has already completed execution.
    /// (In fact, the private function has been executed and proven, along with
    /// all other private function calls of the user's tx. A single proof of the
    /// tx has been submitted to the Aztec network, and some time later a
    /// proposer has picked the tx up from the mempool and begun executing all
    /// of the enqueued public functions).
    ///
    /// # Privacy warning
    /// Enqueueing a public function call is an inherently leaky action.
    /// Many interesting applications will require some interaction with public
    /// state, but smart contract developers should try to use public function
    /// calls sparingly, and carefully.
    /// _Internal_ public function calls are especially leaky, because they
    /// completely leak which private contract made the call.
    /// See also: https://docs.aztec.network/developers/reference/considerations/privacy_considerations
    ///
    /// # Arguments
    /// * `context` - The PrivateContext -- made magically available to the body
    ///               of every #[private] function as `context`, through the
    ///               #[private] annotation's macro.
    ///
    pub fn enqueue(self, context: &mut PrivateContext) {
        let calldata = self.args.push_front(self.selector.to_field());
        let calldata_hash = hash_calldata(calldata);
        execution_cache::store(calldata, calldata_hash);
        context.call_public_function_with_calldata_hash(
            self.target_contract,
            calldata_hash,
            /*static=*/
            false,
        )
    }

    /// Enqueues a read-only call to this public function.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state, emit L2->L1 messages, nor emit events. Any nested
    /// calls are constrained to also be staticcalls.
    ///
    /// # Arguments
    /// * `context` - The PrivateContext -- made magically available to the body
    ///               of every #[private] function as `context`, through the
    ///               #[private] annotation's macro.
    ///
    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let calldata = self.args.push_front(self.selector.to_field());
        let calldata_hash = hash_calldata(calldata);
        execution_cache::store(calldata, calldata_hash);
        context.call_public_function_with_calldata_hash(
            self.target_contract,
            calldata_hash,
            /*static=*/
            true,
        )
    }

    /// Enqueues a call to this public function, and designates it to be the
    /// teardown function for this tx. Only one teardown function call can be
    /// made by a tx.
    ///
    /// Niche function: Only wallet developers and paymaster contract developers
    /// (aka Fee-payment contracts) will need to make use of this function.
    ///
    /// Aztec supports a three-phase execution model: setup, app logic, teardown.
    /// The phases exist to enable a fee payer to take on the risk of paying
    /// a transaction fee, safe in the knowledge that their payment (in whatever
    /// token or method the user chooses) will succeed, regardless of whether
    /// the app logic will succeed. The "setup" phase ensures the fee payer
    /// has sufficient balance to pay the proposer their fees.
    /// The teardown phase is primarily intended to: calculate exactly
    /// how much the user owes, based on gas consumption, and refund the user
    /// any change.
    ///
    /// Note: in some cases, the cost of refunding the user (i.e. DA costs of
    /// tx side-effects) might exceed the refund amount. For app logic with
    /// fairly stable and predictable gas consumption, a material refund amount
    /// is unlikely. For app logic with unpredictable gas consumption, a
    /// refund might be important to the user (e.g. if a hefty function reverts
    /// very early). Wallet/FPC/Paymaster developers should be mindful of this.
    ///
    /// See `enqueue` for more information about enqueuing public function calls.
    ///
    /// # Arguments
    /// * `context` - The PrivateContext -- made magically available to the body
    ///               of every #[private] function as `context`, through the
    ///               #[private] annotation's macro.
    ///
    pub fn set_as_teardown(self, context: &mut PrivateContext) {
        let calldata = self.args.push_front(self.selector.to_field());
        let calldata_hash = hash_calldata(calldata);
        execution_cache::store(calldata, calldata_hash);
        context.set_public_teardown_function_with_calldata_hash(
            self.target_contract,
            calldata_hash,
            false,
        )
    }
}

impl<let M: u32, T> CallInterface<M> for PublicCallInterface<M, T> {
    fn get_args(self) -> [Field] {
        self.args
    }

    fn get_selector(self) -> FunctionSelector {
        self.selector
    }

    fn get_name(self) -> str<M> {
        self.name
    }

    fn get_contract_address(self) -> AztecAddress {
        self.target_contract
    }

    fn get_is_static(self) -> bool {
        self.is_static
    }
}

// PublicStaticCallInterface

pub struct PublicStaticCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args: [Field],
    return_type: T,
    is_static: bool,
    gas_opts: GasOpts,
}

impl<let M: u32, T> PublicStaticCallInterface<M, T>
where
    T: Deserialize,
{
    pub fn new(
        target_contract: AztecAddress,
        selector: FunctionSelector,
        name: str<M>,
        args: [Field],
    ) -> Self {
        Self {
            target_contract,
            selector,
            name,
            args,
            return_type: std::mem::zeroed(),
            is_static: true,
            gas_opts: GasOpts::default(),
        }
    }

    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    /// Makes the read-only call to this public function.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state or emit events. Any nested calls are constrained to
    /// also be staticcalls.
    ///
    /// Will revert if the called function reverts or runs out of gas.
    ///
    /// # Arguments
    /// * `context` - The PublicContext -- made magically available to the body
    ///               of every #[public] function as `context`, through the
    ///               #[public] annotation's macro.
    ///
    /// # Returns
    /// * `T` - Whatever data the called function has returned.
    ///
    pub unconstrained fn view(self, context: &mut PublicContext) -> T {
        let returns = context.static_call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        Deserialize::deserialize(returns.as_array())
    }

    /// Enqueues a read-only call to this public function.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state, emit L2->L1 messages, nor emit events. Any nested
    /// calls are constrained to also be staticcalls.
    ///
    /// # Arguments
    /// * `context` - The PrivateContext -- made magically available to the body
    ///               of every #[private] function as `context`, through the
    ///               #[private] annotation's macro.
    ///
    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let calldata = self.args.push_front(self.selector.to_field());
        let calldata_hash = hash_calldata(calldata);
        execution_cache::store(calldata, calldata_hash);
        context.call_public_function_with_calldata_hash(
            self.target_contract,
            calldata_hash,
            /*static=*/
            true,
        )
    }
}

impl<let M: u32, T> CallInterface<M> for PublicStaticCallInterface<M, T> {
    fn get_args(self) -> [Field] {
        self.args
    }

    fn get_selector(self) -> FunctionSelector {
        self.selector
    }

    fn get_name(self) -> str<M> {
        self.name
    }

    fn get_contract_address(self) -> AztecAddress {
        self.target_contract
    }

    fn get_is_static(self) -> bool {
        self.is_static
    }
}

// UtilityCallInterface

pub struct UtilityCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args_hash: Field,
    args: [Field],
    return_type: T,
}

impl<let M: u32, T> CallInterface<M> for UtilityCallInterface<M, T> {
    fn get_args(self) -> [Field] {
        self.args
    }

    fn get_selector(self) -> FunctionSelector {
        self.selector
    }

    fn get_name(self) -> str<M> {
        self.name
    }

    fn get_contract_address(self) -> AztecAddress {
        self.target_contract
    }

    fn get_is_static(self) -> bool {
        false
    }
}

impl<let M: u32, T> UtilityCallInterface<M, T> {
    pub fn new(
        target_contract: AztecAddress,
        selector: FunctionSelector,
        name: str<M>,
        args: [Field],
    ) -> Self {
        let args_hash = hash_args(args);
        Self { target_contract, selector, name, args_hash, args, return_type: std::mem::zeroed() }
    }

    pub fn get_args(self) -> [Field] {
        self.args
    }

    pub fn get_selector(self) -> FunctionSelector {
        self.selector
    }

    pub fn get_name(self) -> str<M> {
        self.name
    }

    pub fn get_contract_address(self) -> AztecAddress {
        self.target_contract
    }
}
