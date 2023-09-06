use dep::aztec::context::{PrivateContext, PublicContext};
use dep::aztec::state_vars::map::Map;
use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::types::type_serialisation::field_serialisation::FieldSerialisationMethods;
use dep::aztec::types::type_serialisation::field_serialisation::FIELD_SERIALISED_LEN;
use dep::aztec::types::type_serialisation::TypeSerialisationInterface;
use dep::std::option::Option;

struct Storage {
    approved_action: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
}

impl Storage {
  fn init(
    private_context: Option<&mut PrivateContext>,
    public_context: Option<&mut PublicContext>,
  ) -> Self {
    Storage {
        approved_action: Map::new(
        private_context,
        public_context,
        3,
        |private_context, public_context, slot| {
            PublicState::new(
                private_context,
                public_context,
                slot,
                FieldSerialisationMethods,
            )
        },
        ),
    }
  }
}