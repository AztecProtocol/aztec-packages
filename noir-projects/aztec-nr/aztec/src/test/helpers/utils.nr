use crate::{
    context::{call_interfaces::CallInterface, gas::GasOpts, PrivateContext, PublicContext},
    hash::hash_args,
    oracle::execution_cache,
    test::helpers::txe_oracles,
};
use protocol_types::{
    address::AztecAddress,
    contract_instance::ContractInstance,
    public_keys::PublicKeys,
    traits::{Deserialize, Serialize},
};
use std::meta::derive;

// The following 2 lines have been added here because derivation of Serialize and Deserialize does not handle imports
use protocol_types::public_keys::{IvpkM, NpkM, OvpkM, TpkM};
use std::embedded_curve_ops::EmbeddedCurvePoint;

pub struct Deployer<let N: u32, let M: u32> {
    pub path: str<N>,
    pub name: str<M>,
    pub secret: Field,
}

impl<let N: u32, let M: u32> Deployer<N, M> {
    pub unconstrained fn with_private_initializer<C, let P: u32>(
        self,
        from: AztecAddress,
        call_interface: C,
    ) -> ContractInstance
    where
        C: CallInterface<P>,
    {
        let instance = txe_oracles::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.secret,
        );

        let inputs = txe_oracles::get_private_context_inputs(Option::none());
        let mut private_context = PrivateContext::new(inputs, 0);
        let args = call_interface.get_args();
        let args_hash = if args.len() > 0 { hash_args(args) } else { 0 };
        execution_cache::store(args, args_hash);

        let previous_contract_address = txe_oracles::get_contract_address();
        txe_oracles::set_contract_address(from);

        let _ = private_context.call_private_function_with_args_hash(
            instance.to_address(),
            call_interface.get_selector(),
            args_hash,
            call_interface.get_is_static(),
        );

        txe_oracles::set_contract_address(previous_contract_address);

        txe_oracles::advance_blocks_by(1);

        instance
    }

    pub unconstrained fn with_public_void_initializer<let P: u32, C>(
        self,
        from: AztecAddress,
        call_interface: C,
    ) -> ContractInstance
    where
        C: CallInterface<P>,
    {
        let instance = txe_oracles::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.secret,
        );

        let mut public_context = PublicContext::new(|| panic(f"Provide args hash manually"));

        let previous_contract_address = txe_oracles::get_contract_address();
        txe_oracles::set_contract_address(from);

        let results = public_context.call_public_function(
            instance.to_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            GasOpts::default(),
        );
        assert(results.len() == 0);

        txe_oracles::set_contract_address(previous_contract_address);

        txe_oracles::advance_blocks_by(1);

        instance
    }

    pub unconstrained fn with_public_initializer<let P: u32, T, C>(
        self,
        from: AztecAddress,
        call_interface: C,
    ) -> ContractInstance
    where
        C: CallInterface<P>,
        T: Deserialize<_>,
    {
        let instance = txe_oracles::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.secret,
        );

        let mut public_context = PublicContext::new(|| panic(f"Provide args hash manually"));

        let previous_contract_address = txe_oracles::get_contract_address();
        txe_oracles::set_contract_address(from);

        let _ = public_context.call_public_function(
            instance.to_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            GasOpts::default(),
        );
        txe_oracles::set_contract_address(previous_contract_address);

        txe_oracles::advance_blocks_by(1);

        instance
    }

    pub unconstrained fn without_initializer(self) -> ContractInstance {
        txe_oracles::deploy(self.path, self.name, "", &[], self.secret)
    }
}

#[derive(Deserialize, Serialize)]
pub struct TestAccount {
    pub address: AztecAddress,
    pub keys: PublicKeys,
}
