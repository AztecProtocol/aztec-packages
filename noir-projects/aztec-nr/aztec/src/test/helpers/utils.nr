use crate::{
    context::call_interfaces::{CallInterface, PrivateCallInterface, PublicCallInterface},
    test::helpers::{test_environment::TestEnvironment, txe_oracles},
};
use protocol_types::{
    address::AztecAddress,
    public_keys::PublicKeys,
    traits::{Deserialize, Serialize},
};
use std::meta::derive;

pub struct ContractDeployment<let N: u32> {
    pub env: TestEnvironment,
    pub path: str<N>,
    pub secret: Field,
}

impl<let N: u32> ContractDeployment<N> {
    /// Finalizes a contract deployment prepared via `TestEnvironment::deploy` by calling a private initializer function
    /// from the `from` account.
    ///
    /// The `initializer_call` is created by calling the intended private initializer function inside the contract's
    /// `interface()` with its arguments:
    /// ```noir
    /// contract MyContract {
    ///   #[private]
    ///   #[initializer]
    ///   fn init_fn(owner: AztecAddress) { ... }
    /// }
    ///
    /// #[test]
    /// unconstrained fn test_deployment() {
    ///   let contract_address = TestEnvironment::new().deploy("MyContract").with_private_initializer(
    ///     MyContract::interface().init_fn(owner)
    ///   );
    /// }
    pub unconstrained fn with_private_initializer<T, let P: u32>(
        self,
        from: AztecAddress,
        initializer_call: PrivateCallInterface<P, T>,
    ) -> AztecAddress
    where
        T: Deserialize,
    {
        let instance = txe_oracles::deploy(
            self.path,
            initializer_call.get_name(),
            initializer_call.get_args(),
            self.secret,
        );

        // initializer_call does not actually have the target_contract value set - it is created with the helper
        // `interface` function created by `generate_contract_interface` in the aztec macros - it represents a call to
        // a contract at an unknown address. Now that we've deployed the contract We can crate a new call interface with
        // the address and perform the call.
        // We probably want to introduce an intermediate struct to represent this, if we're going to keep this API.
        let _ = self.env.call_private::<T, _>(
            from,
            PrivateCallInterface::new(
                instance.to_address(),
                initializer_call.get_selector(),
                initializer_call.get_name(),
                initializer_call.get_args(),
                initializer_call.get_is_static(),
            ),
        );

        instance.to_address()
    }

    /// Finalizes a contract deployment prepared via `TestEnvironment::deploy` by calling a public initializer function
    /// from the `from` account.
    ///
    /// The `initializer_call` is created by calling the intended public initializer function inside the contract's
    /// `interface()` with its arguments:
    /// ```noir
    /// contract MyContract {
    ///   #[public]
    ///   #[initializer]
    ///   fn init_fn(owner: AztecAddress) { ... }
    /// }
    ///
    /// #[test]
    /// unconstrained fn test_deployment() {
    ///   let contract_address = TestEnvironment::new().deploy("MyContract").with_public_initializer(
    ///     MyContract::interface().init_fn(owner)
    ///   );
    /// }
    pub unconstrained fn with_public_initializer<let P: u32, T>(
        self,
        from: AztecAddress,
        initializer_call: PublicCallInterface<P, T>,
    ) -> AztecAddress
    where
        T: Deserialize,
    {
        let instance = txe_oracles::deploy(
            self.path,
            initializer_call.get_name(),
            initializer_call.get_args(),
            self.secret,
        );

        // initializer_call does not actually have the target_contract value set - it is created with the helper
        // `interface` function created by `generate_contract_interface` in the aztec macros - it represents a call to
        // a contract at an unknown address. Now that we've deployed the contract We can crate a new call interface with
        // the address and perform the call.
        // We probably want to introduce an intermediate struct to represent this, if we're going to keep this API.
        let _ = self.env.call_public::<T, _>(
            from,
            PublicCallInterface::new(
                instance.to_address(),
                initializer_call.get_selector(),
                initializer_call.get_name(),
                initializer_call.get_args(),
                initializer_call.get_is_static(),
            ),
        );

        instance.to_address()
    }

    /// Finalizes a contract deployment prepared via `TestEnvironment::deploy` without calling any initializer function.
    ///
    /// Note that initializers cannot be manually called once this function returns, since the contract address itself
    /// contains a commitment to the lack of initialization arguments as per the protocol rules. Initializers can only
    /// be invoked by using the `with_private_initializer` or `with_public_initializer` functions.
    pub unconstrained fn without_initializer(self) -> AztecAddress {
        txe_oracles::deploy(self.path, "", &[], self.secret).to_address()
    }
}

#[derive(Deserialize, Serialize)]
pub struct TestAccount {
    pub address: AztecAddress,
    pub keys: PublicKeys,
}
