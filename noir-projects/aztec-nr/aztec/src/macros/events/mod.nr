use super::utils::compute_event_selector;
use protocol_types::meta::flatten_to_fields;

comptime fn generate_event_interface(s: StructDefinition) -> Quoted {
    let name = s.name();
    let typ = s.as_type();
    let (fields, _) = flatten_to_fields(quote { self }, typ, &[quote {self.header}]);
    let content_len = fields.len();

    let event_type_id = compute_event_selector(s);

    quote {
        impl aztec::event::event_interface::EventInterface<$content_len> for $name {
            fn to_be_bytes(self) -> [u8; $content_len * 32 + 32] {
                let mut buffer: [u8; $content_len * 32 + 32] = [0; $content_len * 32 + 32];
                let event_type_id_bytes: [u8; 32] = $name::get_event_type_id().to_field().to_be_bytes();

                for i in 0..32 {
                    buffer[i] = event_type_id_bytes[i];
                }

                let serialized_event = self.serialize();

                for i in 0..serialized_event.len() {
                    let bytes: [u8; 32] = serialized_event[i].to_be_bytes();
                    for j in 0..32 {
                        buffer[32 + i * 32 + j] = bytes[j];
                    }
                }

                buffer
            }

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
