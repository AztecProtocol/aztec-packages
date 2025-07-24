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

    pub unconstrained fn view(self, context: &mut PublicContext) -> T {
        let returns = context.static_call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        Deserialize::deserialize(returns.as_array())
    }

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
