use aztec::macros::aztec;

#[aztec]
pub contract ContractInstanceDeployer {
    use aztec::{
        macros::{events::event, functions::{private, public, view}, storage::storage},
        protocol_types::{
            address::{AztecAddress, PartialAddress},
            constants::{
                DEFAULT_UPDATE_DELAY, DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE,
                DEPLOYER_CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE, MINIMUM_UPDATE_DELAY,
                REGISTERER_CONTRACT_ADDRESS,
            },
            contract_class_id::ContractClassId,
            public_keys::PublicKeys,
            traits::{Serialize, ToField},
        },
        state_vars::{DelayedPublicMutable, Map},
    };
    use contract_class_registerer::ContractClassRegisterer;

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

    impl ContractInstanceDeployed {
        fn serialize_non_standard(self) -> [Field; 15] {
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

    #[event]
    struct ContractInstanceUpdated {
        DEPLOYER_CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE: Field,
        address: AztecAddress,
        prev_contract_class_id: ContractClassId,
        new_contract_class_id: ContractClassId,
        timestamp_of_change: u64,
    }

    #[storage]
    struct Storage<Context> {
        updated_class_ids: Map<AztecAddress, DelayedPublicMutable<ContractClassId, DEFAULT_UPDATE_DELAY, Context>, Context>,
    }

    #[private]
    fn deploy(
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        public_keys: PublicKeys,
        universal_deploy: bool,
    ) {
        // contract class must be registered to deploy an instance
        ContractClassRegisterer::at(REGISTERER_CONTRACT_ADDRESS)
            .assert_class_id_is_registered(contract_class_id)
            .call(&mut context);

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

        let payload = event.serialize_non_standard();
        aztec::oracle::debug_log::debug_log_format("ContractInstanceDeployed: {}", payload);

        let padded_log = payload.concat([0; 3]);
        // Only the payload needs to be emitted. Since the siloed tag of this event log is publicly known, it's
        // acceptable to pad the log with 0s and reveal the actual payload length.
        let length = payload.len();
        context.emit_private_log(padded_log, length);
    }

    #[public]
    fn update(new_contract_class_id: ContractClassId) {
        let address = context.msg_sender();

        assert(
            context.nullifier_exists(address.to_field(), context.this_address()),
            "msg.sender is not deployed",
        );

        assert(
            context.nullifier_exists(new_contract_class_id.to_field(), REGISTERER_CONTRACT_ADDRESS),
            "New contract class is not registered",
        );

        let scheduled_value_update = storage
            .updated_class_ids
            .at(address)
            .schedule_and_return_value_change(new_contract_class_id);
        let (prev_contract_class_id, timestamp_of_change) = scheduled_value_update.get_previous();

        let event = ContractInstanceUpdated {
            DEPLOYER_CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE,
            address,
            prev_contract_class_id,
            new_contract_class_id,
            timestamp_of_change,
        };

        context.emit_public_log(event);
    }

    #[public]
    fn set_update_delay(new_update_delay: u64) {
        let address = context.msg_sender();

        assert(
            context.nullifier_exists(address.to_field(), context.this_address()),
            "msg.sender is not deployed",
        );

        assert(new_update_delay >= MINIMUM_UPDATE_DELAY, "New update delay is too low");

        storage.updated_class_ids.at(address).schedule_delay_change(new_update_delay);
    }

    #[public]
    #[view]
    fn get_update_delay() -> u64 {
        storage.updated_class_ids.at(context.msg_sender()).get_current_delay()
    }
}
