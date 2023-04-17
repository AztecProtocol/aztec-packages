contract PublicToken {
    use dep::aztec3::abi::Inputs;
    use dep::aztec3::abi::Outputs;
    use dep::aztec3::abi::FinalOutputs;
    use dep::aztec3::pub_abi::PublicInputs;
    use dep::aztec3::pub_abi::PublicOutputs;
    use dep::aztec3::pub_abi::FinalPublicOutputs;
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::storage_map::StorageMap;
    use dep::aztec3::state_vars::storage_field::StorageField;

    global balances = StorageMap { storage_slot: 1 };

    /// ABI constructor []
    fn constructor(
        inputs: pub Inputs,
    ) -> pub FinalOutputs {
        let outputs = Outputs::new();
        outputs.finish(inputs)
    }

    /// ABI mint [{"name":"amount","type":{"kind":"field"},"visibility":"public"},{"name":"recipient","type":{"kind":"struct","fields":[{"name":"x","type":{"kind":"field"}},{"name":"y","type":{"kind":"field"}}],"visibility":"public"}}]
    fn mint(
        inputs: pub PublicInputs,
    ) -> pub FinalPublicOutputs {
        let amount = inputs.args[0];
        let recipient = Point::new(inputs.args[1], inputs.args[2]);

        let outputs = PublicOutputs::new();
        
        let recipient_balance = balances.at(recipient.x);

        // TODO: It should not be needed to assign to an unused variable
        let _old_recipient_balance = recipient_balance.write(recipient_balance.read() + amount);

        outputs.finish(inputs)
    }


    /// ABI transfer [{"name":"amount","type":{"kind":"field"},"visibility":"public"},{"name":"recipient","type":{"kind":"struct","fields":[{"name":"x","type":{"kind":"field"}},{"name":"y","type":{"kind":"field"}}],"visibility":"public"}}]
    fn transfer(
        inputs: pub PublicInputs,
    ) -> pub FinalPublicOutputs {
        let amount = inputs.args[0];
        let recipient = Point::new(inputs.args[1], inputs.args[2]);
        let sender = inputs.call_context.msg_sender;
        
        let outputs = PublicOutputs::new();

        let sender_balance = balances.at(sender);
        let recipient_balance = balances.at(recipient.x);

        // TODO: Handle larger integer values ("long integers are not yet supported")
        if (sender_balance.read() as u120) > (amount as u120) {
            // TODO: It should not be needed to assign to an unused variable
            let _old_sender_balance = sender_balance.write(sender_balance.read() - amount);
            // TODO: But why is it not needed here?
            recipient_balance.write(recipient_balance.read() + amount);
        } else {
            // TODO: Revert if there is not enough balance
        }

        outputs.finish(inputs)
    }

}
