use dep::protocol_types::{
    abis::function_selector::FunctionSelector, address::AztecAddress, traits::Deserialize,
};

use crate::context::{gas::GasOpts, private_context::PrivateContext, public_context::PublicContext};

use crate::hash::hash_args;
use crate::oracle::execution_cache;

pub trait CallInterface<let N: u32> {
    fn get_args(self) -> [Field];
    fn get_selector(self) -> FunctionSelector;
    fn get_name(self) -> str<N>;
    fn get_contract_address(self) -> AztecAddress;
    fn get_is_static(self) -> bool;
}

pub struct PrivateCallInterface<let N: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<N>,
    pub args_hash: Field,
    pub args: [Field],
    pub return_type: T,
    pub is_static: bool,
}

impl<let N: u32, T> PrivateCallInterface<N, T> {
    pub fn call<let M: u32>(self, context: &mut PrivateContext) -> T
    where
        T: Deserialize<M>,
    {
        execution_cache::store(self.args);
        let returns = context.call_private_function_with_args_hash(
            self.target_contract,
            self.selector,
            self.args_hash,
            false,
        );
        let unpacked: T = returns.get_preimage();
        unpacked
    }

    pub fn view<let M: u32>(self, context: &mut PrivateContext) -> T
    where
        T: Deserialize<M>,
    {
        execution_cache::store(self.args);
        let returns = context.call_private_function_with_args_hash(
            self.target_contract,
            self.selector,
            self.args_hash,
            true,
        );
        returns.get_preimage()
    }
}

impl<let N: u32> CallInterface<N> for PrivateVoidCallInterface<N> {
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

pub struct PrivateVoidCallInterface<let N: u32> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<N>,
    pub args_hash: Field,
    pub args: [Field],
    pub return_type: (),
    pub is_static: bool,
}

impl<let N: u32> PrivateVoidCallInterface<N> {
    pub fn call(self, context: &mut PrivateContext) {
        execution_cache::store(self.args);
        context
            .call_private_function_with_args_hash(
                self.target_contract,
                self.selector,
                self.args_hash,
                false,
            )
            .assert_empty();
    }

    pub fn view(self, context: &mut PrivateContext) {
        execution_cache::store(self.args);
        context
            .call_private_function_with_args_hash(
                self.target_contract,
                self.selector,
                self.args_hash,
                true,
            )
            .assert_empty();
    }
}

impl<let N: u32, T> CallInterface<N> for PrivateStaticCallInterface<N, T> {
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

pub struct PrivateStaticCallInterface<let N: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<N>,
    pub args_hash: Field,
    pub args: [Field],
    pub return_type: T,
    pub is_static: bool,
}

impl<let N: u32, T> PrivateStaticCallInterface<N, T> {
    pub fn view<let M: u32>(self, context: &mut PrivateContext) -> T
    where
        T: Deserialize<M>,
    {
        execution_cache::store(self.args);
        let returns = context.call_private_function_with_args_hash(
            self.target_contract,
            self.selector,
            self.args_hash,
            true,
        );
        returns.get_preimage()
    }
}

impl<let N: u32> CallInterface<N> for PrivateStaticVoidCallInterface<N> {
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

pub struct PrivateStaticVoidCallInterface<let N: u32> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<N>,
    pub args_hash: Field,
    pub args: [Field],
    pub return_type: (),
    pub is_static: bool,
}

impl<let N: u32> PrivateStaticVoidCallInterface<N> {
    pub fn view(self, context: &mut PrivateContext) {
        execution_cache::store(self.args);
        context
            .call_private_function_with_args_hash(
                self.target_contract,
                self.selector,
                self.args_hash,
                true,
            )
            .assert_empty();
    }
}

impl<let N: u32, T> CallInterface<N> for PublicCallInterface<N, T> {
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

pub struct PublicCallInterface<let N: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<N>,
    pub args: [Field],
    pub gas_opts: GasOpts,
    pub return_type: T,
    pub is_static: bool,
}

impl<let N: u32, T> PublicCallInterface<N, T> {
    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    pub unconstrained fn call<let M: u32>(self, context: &mut PublicContext) -> T
    where
        T: Deserialize<M>,
    {
        let returns = context.call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        Deserialize::deserialize(returns.as_array::<M>())
    }

    pub unconstrained fn view<let M: u32>(self, context: &mut PublicContext) -> T
    where
        T: Deserialize<M>,
    {
        let returns = context.static_call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        Deserialize::deserialize(returns.as_array::<M>())
    }

    pub fn enqueue(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        execution_cache::store(self.args);
        context.call_public_function_with_args_hash(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/
            false,
        )
    }

    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        execution_cache::store(self.args);
        context.call_public_function_with_args_hash(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/
            true,
        )
    }
}

impl<let N: u32> CallInterface<N> for PublicVoidCallInterface<N> {
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

pub struct PublicVoidCallInterface<let N: u32> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<N>,
    pub args: [Field],
    pub return_type: (),
    pub is_static: bool,
    pub gas_opts: GasOpts,
}

impl<let N: u32> PublicVoidCallInterface<N> {
    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    pub unconstrained fn call(self, context: &mut PublicContext) {
        let returns = context.call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        assert(returns.len() == 0);
    }

    pub unconstrained fn view(self, context: &mut PublicContext) {
        let returns = context.static_call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        assert(returns.len() == 0);
    }

    pub fn enqueue(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        execution_cache::store(self.args);
        context.call_public_function_with_args_hash(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/
            false,
        )
    }

    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        execution_cache::store(self.args);
        context.call_public_function_with_args_hash(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/
            true,
        )
    }
}

impl<let N: u32, T> CallInterface<N> for PublicStaticCallInterface<N, T> {
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

pub struct PublicStaticCallInterface<let N: u32, T> {
    pub target_contract: AztecAddress,
    pub selector: FunctionSelector,
    pub name: str<N>,
    pub args: [Field],
    pub return_type: T,
    pub is_static: bool,
    pub gas_opts: GasOpts,
}

impl<let N: u32, T> PublicStaticCallInterface<N, T> {
    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    pub unconstrained fn view<let M: u32>(self, context: &mut PublicContext) -> T
    where
        T: Deserialize<M>,
    {
        let returns = context.static_call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        Deserialize::deserialize(returns.as_array::<M>())
    }

    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        execution_cache::store(self.args);
        context.call_public_function_with_args_hash(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/
            true,
        )
    }
}

impl<let N: u32> CallInterface<N> for PublicStaticVoidCallInterface<N> {
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

pub struct PublicStaticVoidCallInterface<let N: u32> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<N>,
    args: [Field],
    return_type: (),
    is_static: bool,
    gas_opts: GasOpts,
}

impl<let N: u32> PublicStaticVoidCallInterface<N> {
    pub fn with_gas(self: &mut Self, gas_opts: GasOpts) -> &mut Self {
        self.gas_opts = gas_opts;
        self
    }

    pub unconstrained fn view(self, context: &mut PublicContext) {
        let returns = context.static_call_public_function(
            self.target_contract,
            self.selector,
            self.args,
            self.gas_opts,
        );
        assert(returns.len() == 0);
    }

    pub fn enqueue_view(self, context: &mut PrivateContext) {
        let args_hash = hash_args(self.args);
        execution_cache::store(self.args);
        context.call_public_function_with_args_hash(
            self.target_contract,
            self.selector,
            args_hash,
            /*static=*/
            true,
        )
    }
}
