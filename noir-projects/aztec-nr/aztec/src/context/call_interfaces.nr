use dep::protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    traits::{Deserialize, ToField},
};

use crate::context::{
    gas::GasOpts, private_context::PrivateContext, public_context::PublicContext,
    returns_hash::ReturnsHash,
};
use crate::hash::{hash_args, hash_calldata};
use crate::oracle::execution_cache;
use crate::test::helpers::cheatcodes;

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
        let returns: T = returns_hash.get_preimage();
        returns
    }

    pub fn view(self, context: &mut PrivateContext) -> T {
        execution_cache::store(self.args, self.args_hash);
        let returns_hash = context.call_private_function_with_args_hash(
            self.target_contract,
            self.selector,
            self.args_hash,
            true,
        );
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

// PrivateVoidCallInterface

pub struct PrivateVoidCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args_hash: Field,
    args: [Field],
    return_type: (), // Unit type () indicates this interface is for functions that return nothing (void)
    is_static: bool,
}

impl<let M: u32, T> PrivateVoidCallInterface<M, T>
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

    pub fn call(self, context: &mut PrivateContext) {
        execution_cache::store(self.args, self.args_hash);
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
        execution_cache::store(self.args, self.args_hash);
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

impl<let M: u32, T> CallInterface<M> for PrivateVoidCallInterface<M, T> {
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

// PrivateStaticVoidCallInterface

pub struct PrivateStaticVoidCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args_hash: Field,
    args: [Field],
    return_type: (), // Unit type () indicates this interface is for functions that return nothing (void)
    is_static: bool,
}

impl<let M: u32, T> PrivateStaticVoidCallInterface<M, T> {
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

    pub fn view(self, context: &mut PrivateContext) {
        execution_cache::store(self.args, self.args_hash);
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

impl<let M: u32, T> CallInterface<M> for PrivateStaticVoidCallInterface<M, T> {
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
        Deserialize::deserialize(returns.as_array())
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

// PublicVoidCallInterface

pub struct PublicVoidCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args: [Field],
    return_type: (), // Unit type () indicates this interface is for functions that return nothing (void)
    is_static: bool,
    gas_opts: GasOpts,
}

impl<let M: u32, T> PublicVoidCallInterface<M, T> {
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
            return_type: std::mem::zeroed(),
            is_static,
            gas_opts: GasOpts::default(),
        }
    }

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

impl<let M: u32, T> CallInterface<M> for PublicVoidCallInterface<M, T> {
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

// PublicStaticVoidCallInterface

pub struct PublicStaticVoidCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args: [Field],
    return_type: (), // Unit type () indicates this interface is for functions that return nothing (void)
    is_static: bool,
    gas_opts: GasOpts,
}

impl<let M: u32, T> PublicStaticVoidCallInterface<M, T> {
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

impl<let M: u32, T> CallInterface<M> for PublicStaticVoidCallInterface<M, T> {
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

// UtilityVoidCallInterface

pub struct UtilityVoidCallInterface<let M: u32, T> {
    target_contract: AztecAddress,
    selector: FunctionSelector,
    name: str<M>,
    args_hash: Field,
    args: [Field],
    return_type: T,
}

impl<let M: u32, T> CallInterface<M> for UtilityVoidCallInterface<M, T> {
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

impl<let M: u32, T> UtilityVoidCallInterface<M, T> {
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

pub trait TXEPublicCallInterface<T> {
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field);
}

impl<let M: u32, T> TXEPublicCallInterface<T> for PublicCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field) {
        let (returns_hash, tx_hash) = cheatcodes::public_call_new_flow(
            from,
            self.target_contract,
            self.selector,
            self.args,
            self.is_static,
        );

        let returns = ReturnsHash::new(returns_hash).get_preimage();

        (returns, tx_hash)
    }
}

impl<let M: u32, T> TXEPublicCallInterface<T> for PublicVoidCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field) {
        let (returns_hash, tx_hash) = cheatcodes::public_call_new_flow(
            from,
            self.target_contract,
            self.selector,
            self.args,
            self.is_static,
        );

        let returns = ReturnsHash::new(returns_hash).get_preimage_and_assert_empty();

        (returns, tx_hash)
    }
}

impl<let M: u32, T> TXEPublicCallInterface<T> for PublicStaticCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field) {
        let (returns_hash, tx_hash) = cheatcodes::public_call_new_flow(
            from,
            self.target_contract,
            self.selector,
            self.args,
            self.is_static,
        );

        let returns = ReturnsHash::new(returns_hash).get_preimage();

        (returns, tx_hash)
    }
}

impl<let M: u32, T> TXEPublicCallInterface<T> for PublicStaticVoidCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field) {
        let (returns_hash, tx_hash) = cheatcodes::public_call_new_flow(
            from,
            self.target_contract,
            self.selector,
            self.args,
            self.is_static,
        );

        let returns = ReturnsHash::new(returns_hash).get_preimage_and_assert_empty();

        (returns, tx_hash)
    }
}

pub trait TXEPrivateCallInterface<T> {
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field);
}

impl<let M: u32, T> TXEPrivateCallInterface<T> for PrivateCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field) {
        let args = self.get_args();
        let args_hash = hash_args(args);

        let (_end_side_effect_counter, returns_hash, tx_hash) = cheatcodes::private_call_new_flow(
            from,
            self.get_contract_address(),
            self.get_selector(),
            args,
            args_hash,
            self.get_is_static(),
        );

        let returns: T = ReturnsHash::new(returns_hash).get_preimage();

        (returns, tx_hash)
    }
}

impl<let M: u32, T> TXEPrivateCallInterface<T> for PrivateVoidCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field) {
        let args = self.get_args();
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);

        let (_end_side_effect_counter, returns_hash, tx_hash) = cheatcodes::private_call_new_flow(
            from,
            self.get_contract_address(),
            self.get_selector(),
            args,
            args_hash,
            self.get_is_static(),
        );

        let returns = ReturnsHash::new(returns_hash).get_preimage_and_assert_empty();

        (returns, tx_hash)
    }
}

impl<let M: u32, T> TXEPrivateCallInterface<T> for PrivateStaticCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field) {
        let args = self.get_args();
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);

        let (_, returns_hash, tx_hash) = cheatcodes::private_call_new_flow(
            from,
            self.get_contract_address(),
            self.get_selector(),
            args,
            args_hash,
            self.get_is_static(),
        );

        let returns = ReturnsHash::new(returns_hash).get_preimage();

        (returns, tx_hash)
    }
}

impl<let M: u32, T> TXEPrivateCallInterface<T> for PrivateStaticVoidCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self, from: AztecAddress) -> (T, Field) {
        let args = self.get_args();
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);

        let (_, returns_hash, tx_hash) = cheatcodes::private_call_new_flow(
            from,
            self.get_contract_address(),
            self.get_selector(),
            args,
            args_hash,
            self.get_is_static(),
        );

        let returns = ReturnsHash::new(returns_hash).get_preimage_and_assert_empty();

        (returns, tx_hash)
    }
}

pub trait TXEUtilityCallInterface<T> {
    unconstrained fn call_with_txe(self) -> T;
}

impl<let M: u32, T> TXEUtilityCallInterface<T> for UtilityCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self) -> T {
        let args = self.get_args();
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);

        let returns_hash = crate::oracle::simulate_utility_function::simulate_utility_function(
            self.get_contract_address(),
            self.get_selector(),
            args_hash,
        );

        let returns: T = ReturnsHash::new(returns_hash).get_preimage();
        returns
    }
}

impl<let M: u32, T> TXEUtilityCallInterface<T> for UtilityVoidCallInterface<M, T>
where
    T: Deserialize,
{
    unconstrained fn call_with_txe(self) -> T {
        let args = self.get_args();
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);

        let returns_hash = crate::oracle::simulate_utility_function::simulate_utility_function(
            self.get_contract_address(),
            self.get_selector(),
            args_hash,
        );

        let returns = ReturnsHash::new(returns_hash).get_preimage_and_assert_empty();
        returns
    }
}
