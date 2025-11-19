use dep::protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    traits::{Deserialize, ToField},
};

use crate::context::{gas::GasOpts, private_context::PrivateContext, public_context::PublicContext};
use crate::hash::{hash_args, hash_calldata};
use crate::oracle::execution_cache;

// PrivateCall

#[must_use = "Your private call needs to be passed into the `self.call(...)` method to be executed (e.g. `self.call(MyContract::at(address).my_private_function(...args))`"]
pub struct PrivateCall<let M: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<M>,
    args_hash: Field,
    pub args: [Field],
    return_type: T,
}

impl<let M: u32, T> PrivateCall<M, T> {
    pub fn new(
        target_contract: AztecAddress,
        selector: FunctionSelector,
        name: str<M>,
        args: [Field],
    ) -> Self {
        let args_hash = hash_args(args);
        Self { target_contract, selector, name, args_hash, args, return_type: std::mem::zeroed() }
    }
}

impl<let M: u32, T> PrivateCall<M, T>
where
    T: Deserialize,
{
    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.call(MyContract::at(address).my_private_function(...args))`
    /// instead of manually constructing and calling `PrivateCall`.
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
}

// PrivateStaticCall

#[must_use = "Your private static call needs to be passed into the `self.view(...)` method to be executed (e.g. `self.view(MyContract::at(address).my_private_static_function(...args))`"]
pub struct PrivateStaticCall<let M: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<M>,
    args_hash: Field,
    pub args: [Field],
    return_type: T,
}

impl<let M: u32, T> PrivateStaticCall<M, T> {
    pub fn new(
        target_contract: AztecAddress,
        selector: FunctionSelector,
        name: str<M>,
        args: [Field],
    ) -> Self {
        let args_hash = hash_args(args);
        Self { target_contract, selector, name, args_hash, args, return_type: std::mem::zeroed() }
    }

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.view(MyContract::at(address).my_private_static_function(...args))`
    /// instead of manually constructing and calling `PrivateCall`.
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

// PublicCall

#[must_use = "Your public call needs to be passed into the `self.call(...)`, `self.enqueue(...)` or `self.enqueue_incognito(...)` method to be executed (e.g. `self.call(MyContract::at(address).my_public_function(...args))`"]
pub struct PublicCall<let M: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<M>,
    // TODO(F-131): Determine the length at comptime and drop the use of slices.
    pub args: [Field],
    gas_opts: GasOpts,
    return_type: T,
}

impl<let M: u32, T> PublicCall<M, T> {
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
            gas_opts: GasOpts::default(),
            return_type: std::mem::zeroed(),
        }
    }

    pub fn with_gas(mut self, gas_opts: GasOpts) -> Self {
        self.gas_opts = gas_opts;
        self
    }

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.call(MyContract::at(address).my_public_function(...args))`
    /// instead of manually constructing and calling `PublicCall`.
    pub unconstrained fn call(self, context: PublicContext) -> T
    where
        T: Deserialize,
    {
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

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.enqueue(MyContract::at(address).my_public_function(...args))`
    /// instead of manually constructing and calling `PublicCall`.
    pub fn enqueue(self, context: &mut PrivateContext) {
        self.enqueue_impl(context, false, false)
    }

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.enqueue_incognito(MyContract::at(address).my_public_function(...args))`
    /// instead of manually constructing and calling `PublicCall`.
    pub fn enqueue_incognito(self, context: &mut PrivateContext) {
        self.enqueue_impl(context, false, true)
    }

    fn enqueue_impl(
        self,
        context: &mut PrivateContext,
        is_static_call: bool,
        hide_msg_sender: bool,
    ) {
        let calldata = self.args.push_front(self.selector.to_field());
        let calldata_hash = hash_calldata(calldata);
        execution_cache::store(calldata, calldata_hash);
        context.call_public_function_with_calldata_hash(
            self.target_contract,
            calldata_hash,
            is_static_call,
            hide_msg_sender,
        )
    }

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.set_as_teardown(MyContract::at(address).my_public_function(...args))`
    /// instead of manually constructing and setting the teardown function `PublicCall`.
    pub fn set_as_teardown(self, context: &mut PrivateContext) {
        self.set_as_teardown_impl(context, false);
    }

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.set_as_teardown_incognito(MyContract::at(address).my_public_function(...args))`
    /// instead of manually constructing and setting the teardown function `PublicCall`.
    pub fn set_as_teardown_incognito(self, context: &mut PrivateContext) {
        self.set_as_teardown_impl(context, true);
    }

    fn set_as_teardown_impl(self, context: &mut PrivateContext, hide_msg_sender: bool) {
        let calldata = self.args.push_front(self.selector.to_field());
        let calldata_hash = hash_calldata(calldata);
        execution_cache::store(calldata, calldata_hash);
        context.set_public_teardown_function_with_calldata_hash(
            self.target_contract,
            calldata_hash,
            false,
            hide_msg_sender,
        )
    }
}

// PublicStaticCall

#[must_use = "Your public static call needs to be passed into the `self.view(...)`, `self.enqueue_view(...)` or `self.enqueue_view_incognito(...)` method to be executed (e.g. `self.view(MyContract::at(address).my_public_static_function(...args))`"]
pub struct PublicStaticCall<let M: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<M>,
    pub args: [Field],
    return_type: T,
    gas_opts: GasOpts,
}

impl<let M: u32, T> PublicStaticCall<M, T> {
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
            gas_opts: GasOpts::default(),
        }
    }

    pub fn with_gas(mut self, gas_opts: GasOpts) -> Self {
        self.gas_opts = gas_opts;
        self
    }

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.view(MyContract::at(address).my_public_static_function(...args))`
    /// instead of manually constructing and calling `PublicStaticCall`.
    pub unconstrained fn view(self, context: PublicContext) -> T
    where
        T: Deserialize,
    {
        let returns = context.static_call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        Deserialize::deserialize(returns.as_array())
    }

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.enqueue_view(MyContract::at(address).my_public_static_function(...args))`
    /// instead of manually constructing and calling `PublicStaticCall`.
    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let calldata = self.args.push_front(self.selector.to_field());
        let calldata_hash = hash_calldata(calldata);
        execution_cache::store(calldata, calldata_hash);
        context.call_public_function_with_calldata_hash(
            self.target_contract,
            calldata_hash,
            /*static=*/
            true,
            false,
        )
    }

    /// **[DEPRECATED]**
    /// This function is deprecated. Please use the new contract API:
    /// `self.enqueue_view_incognito(MyContract::at(address).my_public_static_function(...args))`
    /// instead of manually constructing and calling `PublicStaticCall`.
    pub fn enqueue_view_incognito(self, context: &mut PrivateContext) {
        let calldata = self.args.push_front(self.selector.to_field());
        let calldata_hash = hash_calldata(calldata);
        execution_cache::store(calldata, calldata_hash);
        context.call_public_function_with_calldata_hash(
            self.target_contract,
            calldata_hash,
            /*static=*/
            true,
            true,
        )
    }
}

// UtilityCall

pub struct UtilityCall<let M: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<M>,
    args_hash: Field,
    pub args: [Field],
    return_type: T,
}

impl<let M: u32, T> UtilityCall<M, T> {
    pub fn new(
        target_contract: AztecAddress,
        selector: FunctionSelector,
        name: str<M>,
        args: [Field],
    ) -> Self {
        let args_hash = hash_args(args);
        Self { target_contract, selector, name, args_hash, args, return_type: std::mem::zeroed() }
    }
}
