use dep::protocol_types::{
    abis::{function_selector::FunctionSelector, private_circuit_public_inputs::PrivateCircuitPublicInputs},
    address::AztecAddress, traits::Deserialize
};

use crate::context::{
    private_context::PrivateContext, public_context::PublicContext, gas::GasOpts,
    inputs::PrivateContextInputs
};

use crate::oracle::arguments::pack_arguments;
use crate::hash::hash_args;

pub trait CallInterface<let N: u32, T, P, Env> {
    fn get_original(self) -> fn[Env](T) -> P;

    fn get_args(self) -> [Field] {
        self.args
    }

    fn get_selector(self) -> FunctionSelector {
        self.selector
    }

    fn get_name(self) -> str<N> {
        self.name
    }

    fn get_contract_address(self) -> AztecAddress {
        self.target_contract
    }

    fn get_is_static(self) -> bool {
        self.is_static
    }
}

impl<let N: u32, T, P, Env> CallInterface<N, PrivateContextInputs, PrivateCircuitPublicInputs, Env> for PrivateCallInterface<N, T, Env> {
    fn get_original(self) -> fn[Env](PrivateContextInputs) -> PrivateCircuitPublicInputs {
        self.original
    }
}

pub struct PrivateCallInterface<let N: u32, T, Env> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args_hash: Field,
    args: [Field],
    original: fn[Env](PrivateContextInputs) -> PrivateCircuitPublicInputs,
    is_static: bool
}

impl<let N: u32, T, Env> PrivateCallInterface<N, T, Env> {
    pub fn call<let M: u32>(self, context: &mut PrivateContext) -> T where T: Deserialize<M> {
        pack_arguments(self.args);
        let returns = context.call_private_function_with_packed_args(
            self.target_contract,
            self.selector,
            self.args_hash,
            false,
            false
        );
        let unpacked: T = returns.unpack_into();
        unpacked
    }

    pub fn view<let M: u32>(self, context: &mut PrivateContext) -> T where T: Deserialize<M> {
        pack_arguments(self.args);
        let returns = context.call_private_function_with_packed_args(self.target_contract, self.selector, self.args_hash, true, false);
        returns.unpack_into()
    }

    pub fn delegate_call<let M: u32>(self, context: &mut PrivateContext) -> T where T: Deserialize<M> {
        pack_arguments(self.args);
        let returns = context.call_private_function_with_packed_args(self.target_contract, self.selector, self.args_hash, false, true);
        returns.unpack_into()
    }
}

impl<let N: u32, T, P, Env> CallInterface<N, PrivateContextInputs, PrivateCircuitPublicInputs, Env> for PrivateVoidCallInterface<N, Env> {
    fn get_original(self) -> fn[Env](PrivateContextInputs) -> PrivateCircuitPublicInputs {
        self.original
    }
}

pub struct PrivateVoidCallInterface<let N: u32, Env> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args_hash: Field,
    args: [Field],
    original: fn[Env](PrivateContextInputs) -> PrivateCircuitPublicInputs,
    is_static: bool
}

impl<let N: u32, Env> PrivateVoidCallInterface<N, Env> {
    pub fn call(self, context: &mut PrivateContext) {
        pack_arguments(self.args);
        context.call_private_function_with_packed_args(
            self.target_contract,
            self.selector,
            self.args_hash,
            false,
            false
        ).assert_empty();
    }

    pub fn view(self, context: &mut PrivateContext) {
        pack_arguments(self.args);
        context.call_private_function_with_packed_args(self.target_contract, self.selector, self.args_hash, true, false).assert_empty();
    }

    pub fn delegate_call(self, context: &mut PrivateContext) {
        pack_arguments(self.args);
        context.call_private_function_with_packed_args(self.target_contract, self.selector, self.args_hash, false, true).assert_empty();
    }
}

impl<let N: u32, T, P, Env> CallInterface<N, PrivateContextInputs, PrivateCircuitPublicInputs, Env> for PrivateStaticCallInterface<N, T, Env> {
    fn get_original(self) -> fn[Env](PrivateContextInputs) -> PrivateCircuitPublicInputs {
        self.original
    }
}

pub struct PrivateStaticCallInterface<let N: u32, T, Env> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args_hash: Field,
    args: [Field],
    original: fn[Env](PrivateContextInputs) -> PrivateCircuitPublicInputs,
    is_static: bool
}

impl<let N: u32, T, Env> PrivateStaticCallInterface<N, T, Env> {
    pub fn view<let M: u32>(self, context: &mut PrivateContext) -> T where T: Deserialize<M> {
        pack_arguments(self.args);
        let returns = context.call_private_function_with_packed_args(self.target_contract, self.selector, self.args_hash, true, false);
        returns.unpack_into()
    }
}

impl<let N: u32, T, P, Env> CallInterface<N, PrivateContextInputs, PrivateCircuitPublicInputs, Env> for PrivateStaticVoidCallInterface<N, Env> {
    fn get_original(self) -> fn[Env](PrivateContextInputs) -> PrivateCircuitPublicInputs {
        self.original
    }
}

pub struct PrivateStaticVoidCallInterface<let N: u32, Env> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args_hash: Field,
    args: [Field],
    original: fn[Env](PrivateContextInputs) -> PrivateCircuitPublicInputs,
    is_static: bool
}

impl<let N: u32, Env> PrivateStaticVoidCallInterface<N, Env> {
    pub fn view(self, context: &mut PrivateContext) {
        pack_arguments(self.args);
        context.call_private_function_with_packed_args(self.target_contract, self.selector, self.args_hash, true, false).assert_empty();
    }
}

impl<let N: u32, T, P, Env> CallInterface<N, (), T, Env> for PublicCallInterface<N, T, Env> {
    fn get_original(self) -> fn[Env](()) -> T {
        self.original
    }
}

pub struct PublicCallInterface<let N: u32, T, Env> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args: [Field],
    gas_opts: GasOpts,
    original: fn[Env](()) -> T,
    is_static: bool
}

impl<let N: u32, T, Env> PublicCallInterface<N, T, Env> {
    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    pub fn call<let M: u32>(self, context: &mut PublicContext) -> T where T: Deserialize<M> {
        let returns = context.call_public_function(self.target_contract, self.selector, self.args, self.gas_opts);
        returns.deserialize_into()
    }

    pub fn view<let M: u32>(self, context: &mut PublicContext) -> T where T: Deserialize<M> {
        let returns = context.static_call_public_function(self.target_contract, self.selector, self.args, self.gas_opts);
        returns.deserialize_into()
    }

    pub fn delegate_call<let M: u32>(self, context: &mut PublicContext) -> T where T: Deserialize<M> {
        let returns = context.delegate_call_public_function(self.target_contract, self.selector, self.args);
        returns.deserialize_into()
    }

    pub fn enqueue(self, context: &mut PrivateContext) {
        // Public functions should be routed through the dispatch function.
        let dispatch_selector = comptime {
            FunctionSelector::from_signature("public_dispatch(Field)")
        };
        let dispatch_args = &[self.selector.to_field()].append(self.args);
        pack_arguments(dispatch_args);
        let args_hash = hash_args(dispatch_args);
        context.call_public_function_with_packed_args(
            self.target_contract,
            dispatch_selector,
            args_hash,
            /*static=*/ false,
            /*delegate=*/ false
        )
    }

    pub fn enqueue_view(self, context: &mut PrivateContext) {
        // Public functions should be routed through the dispatch function.
        let dispatch_selector = comptime {
            FunctionSelector::from_signature("public_dispatch(Field)")
        };
        let dispatch_args = &[self.selector.to_field()].append(self.args);
        pack_arguments(dispatch_args);
        let args_hash = hash_args(dispatch_args);
        context.call_public_function_with_packed_args(
            self.target_contract,
            dispatch_selector,
            args_hash,
            /*static=*/ true,
            /*delegate=*/ false
        )
    }

    pub fn delegate_enqueue(self, context: &mut PrivateContext) {
        // Public functions should be routed through the dispatch function.
        let dispatch_selector = comptime {
            FunctionSelector::from_signature("public_dispatch(Field)")
        };
        let dispatch_args = &[self.selector.to_field()].append(self.args);
        pack_arguments(dispatch_args);
        let args_hash = hash_args(dispatch_args);
        context.call_public_function_with_packed_args(
            self.target_contract,
            dispatch_selector,
            args_hash,
            /*static=*/ false,
            /*delegate=*/ true
        )
    }
}

impl<let N: u32, T, P, Env> CallInterface<N, (), (), Env> for PublicVoidCallInterface<N, Env> {
    fn get_original(self) -> fn[Env](()) -> () {
        self.original
    }
}

pub struct PublicVoidCallInterface<let N: u32, Env> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args: [Field],
    original: fn[Env](()) -> (),
    is_static: bool,
    gas_opts: GasOpts
}

impl<let N: u32, Env> PublicVoidCallInterface<N, Env> {
    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    pub fn call(self, context: &mut PublicContext) {
        let returns = context.call_public_function(self.target_contract, self.selector, self.args, self.gas_opts);
        returns.assert_empty()
    }

    pub fn view(self, context: &mut PublicContext) {
        let returns = context.static_call_public_function(self.target_contract, self.selector, self.args, self.gas_opts);
        returns.assert_empty()
    }

    pub fn delegate_call(self, context: &mut PublicContext) {
        let returns = context.delegate_call_public_function(self.target_contract, self.selector, self.args);
        returns.assert_empty()
    }

    pub fn enqueue(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        pack_arguments(self.args);
        context.call_public_function_with_packed_args(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/ false,
            /*delegate=*/ false
        )
    }

    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        pack_arguments(self.args);
        context.call_public_function_with_packed_args(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/ true,
            /*delegate=*/ false
        )
    }

    pub fn delegate_enqueue(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        pack_arguments(self.args);
        context.call_public_function_with_packed_args(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/ false,
            /*delegate=*/ true
        )
    }
}

impl<let N: u32, T, P, Env> CallInterface<N, (), T, Env> for PublicStaticCallInterface<N, T, Env> {
    fn get_original(self) -> fn[Env](()) -> T {
        self.original
    }
}

pub struct PublicStaticCallInterface<let N: u32, T, Env> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args: [Field],
    original: fn[Env](()) -> T,
    is_static: bool,
    gas_opts: GasOpts
}

impl<let N: u32, T, Env> PublicStaticCallInterface<N, T, Env> {
    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    pub fn view<let M: u32>(self, context: &mut PublicContext) -> T where T: Deserialize<M> {
        let returns = context.static_call_public_function(self.target_contract, self.selector, self.args, self.gas_opts);
        let unpacked: T = returns.deserialize_into();
        unpacked
    }

    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        pack_arguments(self.args);
        context.call_public_function_with_packed_args(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/ true,
            /*delegate=*/ false
        )
    }
}

impl<let N: u32, T, P, Env> CallInterface<N, (), (), Env> for PublicStaticVoidCallInterface<N, Env> {
    fn get_original(self) -> fn[Env](()) -> () {
        self.original
    }
}

pub struct PublicStaticVoidCallInterface<let N: u32, Env> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args: [Field],
    original: fn[Env](()) -> (),
    is_static: bool,
    gas_opts: GasOpts
}

impl<let N: u32, Env> PublicStaticVoidCallInterface<N, Env> {
    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    pub fn view(self, context: &mut PublicContext) {
        let returns = context.static_call_public_function(self.target_contract, self.selector, self.args, self.gas_opts);
        returns.assert_empty()
    }

    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        pack_arguments(self.args);
        context.call_public_function_with_packed_args(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/ true,
            /*delegate=*/ false
        )
    }
}
