use dep::aztec::macros::aztec;

#[aztec]
contract ContractInstanceDeployer {
    use dep::aztec::macros::{events::event, functions::private};
    use dep::aztec::protocol_types::{
        address::{AztecAddress, PartialAddress},
        constants::DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE,
        contract_class_id::ContractClassId,
        public_keys::PublicKeys,
        traits::Serialize,
        utils::arrays::array_concat,
    };
    use std::meta::derive;

    #[derive(Serialize)]
    #[event]
    struct ContractInstanceDeployed {
        DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE: Field,
        address: AztecAddress,
        version: u8,
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        public_keys: PublicKeys,
        deployer: AztecAddress,
    }

    // We need to impl this separately because ts deserializes a point as two fields only.
    // We had issues that:
    // Notice how the 'is_infinite' field is deserialized as the next point.
    // {
    //     masterNullifierPublicKey: Point {
    //   x: Fr<0x0000000000000000000000000000000000000000000000000000000000000012>,
    //   y: Fr<0x0000000000000000000000000000000000000000000000000000000000000034>,
    //   isInfinite: false,
    //   kind: 'point'
    // },
    // masterIncomingViewingPublicKey: Point {
    //   x: Fr<0x0000000000000000000000000000000000000000000000000000000000000000>,
    //   y: Fr<0x0000000000000000000000000000000000000000000000000000000000000056>,
    //   isInfinite: false,
    //   kind: 'point'
    // },
    // masterOutgoingViewingPublicKey: Point {
    //   x: Fr<0x0000000000000000000000000000000000000000000000000000000000000078>,
    //   y: Fr<0x0000000000000000000000000000000000000000000000000000000000000000>,
    //   isInfinite: false,
    //   kind: 'point'
    // },
    // masterTaggingPublicKey: Point {
    //   x: Fr<0x0000000000000000000000000000000000000000000000000000000000000910>,
    //   y: Fr<0x0000000000000000000000000000000000000000000000000000000000001112>,
    //   isInfinite: false,
    //   kind: 'point'
    // }

    impl Serialize<15> for ContractInstanceDeployed {
        fn serialize(self) -> [Field; 15] {
            [
                self.DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE,
                self.address.to_field(),
                self.version.to_field(),
                self.salt,
                self.contract_class_id.to_field(),
                self.initialization_hash,
                self.public_keys.npk_m.serialize()[0],
                self.public_keys.npk_m.serialize()[1],
                self.public_keys.ivpk_m.serialize()[0],
                self.public_keys.ivpk_m.serialize()[1],
                self.public_keys.ovpk_m.serialize()[0],
                self.public_keys.ovpk_m.serialize()[1],
                self.public_keys.tpk_m.serialize()[0],
                self.public_keys.tpk_m.serialize()[1],
                self.deployer.to_field(),
            ]
        }
    }

    #[private]
    fn deploy(
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        public_keys: PublicKeys,
        universal_deploy: bool,
    ) {
        // TODO(@spalladino): assert nullifier_exists silo(contract_class_id, ContractClassRegisterer)
        let deployer = if universal_deploy {
            AztecAddress::zero()
        } else {
            context.msg_sender()
        };

        let partial_address =
            PartialAddress::compute(contract_class_id, salt, initialization_hash, deployer);

        let address = AztecAddress::compute(public_keys, partial_address);

        // Emit the address as a nullifier to be able to prove that this instance has been (not) deployed
        context.push_nullifier(address.to_field());

        // Broadcast the event
        let event = ContractInstanceDeployed {
            DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE,
            contract_class_id,
            address,
            public_keys,
            initialization_hash,
            salt,
            deployer,
            version: 1,
        };

        // This is a hack to get around there being two implementations of `Serialize`.
        // Can be replaced with the below once fixed
        // let payload = event.serialize();
        let payload = Serialize::<15>::serialize(event);
        dep::aztec::oracle::debug_log::debug_log_format("ContractInstanceDeployed: {}", payload);

        let padded_log = array_concat(payload, [0; 3]);
        context.emit_private_log(padded_log);
    }
}
