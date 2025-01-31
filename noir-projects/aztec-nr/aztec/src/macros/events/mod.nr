use super::utils::compute_event_selector;
use protocol_types::meta::generate_serialize_to_fields;

comptime fn generate_event_interface(s: StructDefinition) -> Quoted {
    let name = s.name();
    let typ = s.as_type();
    let (serialization_fields, _) =
        generate_serialize_to_fields(quote { self }, typ, &[quote {self.header}], false);
    let content_len = serialization_fields.len();

    let event_type_id = compute_event_selector(s);

    quote {
        impl aztec::event::event_interface::EventInterface<$content_len> for $name {
            fn get_event_type_id() -> aztec::protocol_types::abis::event_selector::EventSelector {
                aztec::protocol_types::abis::event_selector::EventSelector::from_field($event_type_id)
            }

            fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
                _emit(self);
            }
        }
    }
}

pub comptime fn event(s: StructDefinition) -> Quoted {
    let event_interface = generate_event_interface(s);
    s.add_attribute("abi(events)");
    quote {
        $event_interface
    }
}
