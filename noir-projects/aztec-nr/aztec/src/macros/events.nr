use super::utils::{compute_event_selector, get_trait_impl_method};

comptime fn generate_event_interface(s: TypeDefinition) -> Quoted {
    let name = s.name();

    let event_type_id = compute_event_selector(s);

    let from_field = get_trait_impl_method(
        quote { crate::protocol_types::abis::event_selector::EventSelector }.as_type(),
        quote { crate::protocol_types::traits::FromField },
        quote { from_field },
    );

    quote {
        impl aztec::event::event_interface::EventInterface for $name {
            fn get_event_type_id() -> aztec::protocol_types::abis::event_selector::EventSelector {
                $from_field($event_type_id)
            }
        }
    }
}

pub comptime fn event(s: TypeDefinition) -> Quoted {
    let event_interface = generate_event_interface(s);
    s.add_attribute("abi(events)");
    quote {
        $event_interface
    }
}
