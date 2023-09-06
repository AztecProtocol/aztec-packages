mod types;

use dep::value_note::value_note::{ValueNote, ValueNoteMethods, VALUE_NOTE_LEN};

use crate::types::{
    TransparentNote, TransparentNoteMethods, TRANSPARENT_NOTE_LEN,
};

use dep::aztec::context::{PrivateContext, PublicContext};
use dep::aztec::{
    state_vars::{map::Map, public_state::PublicState, set::Set},
    types::type_serialisation::field_serialisation::{
        FieldSerialisationMethods, FIELD_SERIALISED_LEN,
    },
};
use dep::std::option::Option;

struct Storage {
    admin: PublicState<Field, FIELD_SERIALISED_LEN>,
    minters: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
    balances: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
    total_supply: PublicState<Field, FIELD_SERIALISED_LEN>,
    pending_shields: Set<TransparentNote, TRANSPARENT_NOTE_LEN>,
    public_balances: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
    public_allowances: Map<Map<PublicState<Field, FIELD_SERIALISED_LEN>>>,
}

impl Storage {
    fn init(
        private_context: Option<&mut PrivateContext>,
        public_context: Option<&mut PublicContext>,
    ) -> Self {
        Storage {
            admin: PublicState::new(
                private_context,
                public_context,
                1,
                FieldSerialisationMethods,
            ),
            minters: Map::new(
                private_context,
                public_context,
                2,
                |private_context, public_context, slot| {
                    PublicState::new(
                        private_context,
                        public_context,
                        slot,
                        FieldSerialisationMethods,
                    )
                },
            ),
            balances: Map::new(
                private_context,
                public_context,
                3,
                |private_context, public_context, slot| {
                    Set::new(private_context, public_context, slot, ValueNoteMethods)
                },
            ),
            total_supply: PublicState::new(
                private_context,
                public_context,
                4,
                FieldSerialisationMethods,
            ),
            pending_shields: Set::new(private_context, public_context, 5, TransparentNoteMethods),
            public_balances: Map::new(
                private_context,
                public_context,
                6,
                |private_context, public_context, slot| {
                    PublicState::new(
                        private_context,
                        public_context,
                        slot,
                        FieldSerialisationMethods,
                    )
                },
            ),
            public_allowances: Map::new(
                private_context,
                public_context,
                7,
                |private_context, public_context, s1| {
                    Map::new(
                        private_context,
                        public_context,
                        s1,
                        |private_context, public_context, s2| {
                            PublicState::new(
                                private_context,
                                public_context,
                                s2,
                                FieldSerialisationMethods,
                            )
                        },
                    )
                },
            ),
        }
    }
}
