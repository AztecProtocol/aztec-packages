use crate::{
    context::call_interfaces::{CallInterface, PrivateCallInterface, PublicCallInterface},
    test::helpers::{test_environment::TestEnvironment, txe_oracles},
};
use protocol_types::{
    address::AztecAddress,
    contract_instance::ContractInstance,
    public_keys::PublicKeys,
    traits::{Deserialize, Serialize},
};
use std::meta::derive;

pub struct Deployer<let N: u32, let M: u32> {
    pub env: TestEnvironment,
    pub path: str<N>,
    pub name: str<M>,
    pub secret: Field,
}

impl<let N: u32, let M: u32> Deployer<N, M> {
    pub unconstrained fn with_private_initializer<T, let P: u32>(
        self,
        from: AztecAddress,
        call_interface: PrivateCallInterface<P, T>,
    ) -> ContractInstance
    where
        T: Deserialize,
    {
        let instance = txe_oracles::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.secret,
        );

        // call_interface does not actually have the target_contract value set - it is created with the helper
        // `interface` function created by `generate_contract_interface` in the aztec macros - it represents a call to
        // a contract at an unknown address. Now that we've deployed the contract We can crate a new call interface with
        // the address and perform the call.
        // We probably want to introduce an intermediate struct to represent this, if we're going to keep this API.
        let _ = self.env.call_private::<T, _>(
            from,
            PrivateCallInterface::new(
                instance.to_address(),
                call_interface.get_selector(),
                call_interface.get_name(),
                call_interface.get_args(),
                call_interface.get_is_static(),
            ),
        );

        instance
    }

    pub unconstrained fn with_public_initializer<let P: u32, T>(
        self,
        from: AztecAddress,
        call_interface: PublicCallInterface<P, T>,
    ) -> ContractInstance
    where
        T: Deserialize,
    {
        let instance = txe_oracles::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.secret,
        );

        // call_interface does not actually have the target_contract value set - it is created with the helper
        // `interface` function created by `generate_contract_interface` in the aztec macros - it represents a call to
        // a contract at an unknown address. Now that we've deployed the contract We can crate a new call interface with
        // the address and perform the call.
        // We probably want to introduce an intermediate struct to represent this, if we're going to keep this API.
        let _ = self.env.call_public::<T, _>(
            from,
            PublicCallInterface::new(
                instance.to_address(),
                call_interface.get_selector(),
                call_interface.get_name(),
                call_interface.get_args(),
                call_interface.get_is_static(),
            ),
        );

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
