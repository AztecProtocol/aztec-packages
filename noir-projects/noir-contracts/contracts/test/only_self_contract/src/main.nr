use aztec::macros::aztec;

/// Contract used to test the #[only_self] attribute restricts the access as expected.
#[aztec]
pub contract OnlySelf {
    use aztec::macros::functions::{external, only_self};

    #[external("private")]
    #[only_self]
    fn only_self_private() {}

    #[external("public")]
    #[only_self]
    fn only_self_public() {}

    #[external("private")]
    fn call_only_self_private() {
        self.call_self.only_self_private();
    }

    #[external("public")]
    fn call_only_self_public() {
        self.call_self.only_self_public();
    }
}

mod test {
    use super::OnlySelf;
    use aztec::{
        protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
    };

    unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
        let mut env = TestEnvironment::new();
        let caller = env.create_light_account();
        let instance_address = env.deploy("OnlySelf").without_initializer();

        (env, caller, instance_address)
    }

    #[test(should_fail_with = "Function only_self_private can only be called by the same contract")]
    unconstrained fn only_self_private_function_fails_if_called_from_other_contract() {
        let (mut env, caller, instance_address) = setup();
        let instance = OnlySelf::at(instance_address);

        env.call_private(caller, instance.only_self_private());
    }

    #[test(should_fail_with = "Function only_self_public can only be called by the same contract")]
    unconstrained fn only_self_public_function_fails_if_called_from_other_contract() {
        let (mut env, caller, instance_address) = setup();
        let instance = OnlySelf::at(instance_address);

        env.call_public(caller, instance.only_self_public());
    }

    #[test]
    unconstrained fn only_self_private_function_succeeds_if_called_from_same_contract() {
        let (mut env, caller, instance_address) = setup();
        let instance = OnlySelf::at(instance_address);

        env.call_private(caller, instance.call_only_self_private());
    }

    #[test]
    unconstrained fn only_self_public_function_succeeds_if_called_from_same_contract() {
        let (mut env, caller, instance_address) = setup();
        let instance = OnlySelf::at(instance_address);

        env.call_public(caller, instance.call_only_self_public());
    }
}
