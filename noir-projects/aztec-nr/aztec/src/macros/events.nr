use crate::{
    macros::utils::{compute_struct_selector, derive_serialize_if_not_implemented, get_trait_impl_method},
    utils::cmap::CHashMap,
};
use std::panic;

/// A map from module to a map from event selector to event name indicating whether the event selector has already been
/// seen during that module's contract compilation - prevents event selector collisions within a contract.
comptime mut global EVENT_SELECTORS: CHashMap<Module, CHashMap<Field, Quoted>> = CHashMap::new();

/// Returns the event selectors registered for a specific module.
pub comptime fn get_event_selectors(m: Module) -> CHashMap<Field, Quoted> {
    EVENT_SELECTORS.get(m).unwrap_or(CHashMap::new())
}

comptime fn generate_event_interface_and_get_selector(s: TypeDefinition) -> (Quoted, Field) {
    let name = s.name();

    let event_selector = compute_struct_selector(s, quote { crate::event::EventSelector::from_signature });

    let from_field = get_trait_impl_method(
        quote { crate::event::EventSelector }.as_type(),
        quote { crate::protocol::traits::FromField },
        quote { from_field },
    );

    (
        quote {
        impl aztec::event::event_interface::EventInterface for $name {
            fn get_event_type_id() -> aztec::event::EventSelector {
                $from_field($event_selector)
            }
        }
    },
        event_selector,
    )
}

comptime fn register_event_selector(m: Module, event_selector: Field, event_name: Quoted) {
    let mut module_events = get_event_selectors(m);

    let existing_event = module_events.get(event_selector);
    if existing_event.is_some() {
        let existing_event = existing_event.unwrap();
        panic(
            f"Event selector collision detected between events '{event_name}' and '{existing_event}'",
        );
    }

    module_events.insert(event_selector, event_name);
    EVENT_SELECTORS.insert(m, module_events);
}

pub comptime fn event(s: TypeDefinition) -> Quoted {
    let (event_interface_impl, event_selector) = generate_event_interface_and_get_selector(s);
    register_event_selector(s.module(), event_selector, s.name());

    let serialize_impl = derive_serialize_if_not_implemented(s);

    s.add_attribute("abi(events)");

    quote {
        $event_interface_impl
        $serialize_impl
    }
}
