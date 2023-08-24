use dep::aztec::state_vars::map::Map;
use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::types::type_serialisation::TypeSerialisationInterface;
use dep::aztec::types::type_serialisation::field_serialisation::FieldSerialisationMethods;
use dep::aztec::types::type_serialisation::field_serialisation::FIELD_SERIALISED_LEN;

struct SwapClaimNote {
    input_asset: Field,
    input_amount: Field,
    output_asset: Field,
    index: Field,
    secret_hash: Field,
}

impl SwapClaimNote {
    fn compute_note_hash(self) -> Field {
        dep::std::hash::pedersen([
            self.input_asset,
            self.input_amount,
            self.output_asset,
            self.index,
            self.secret_hash,
        ])[0]
    }
}

struct Swap {
    input_amount: Field,
    output_amount: Field,
    is_pending: bool,
}

global SWAP_SERIALISED_LEN: Field = 3;

fn deserialiseSwap(fields: [Field; SWAP_SERIALISED_LEN]) -> Swap {
    Swap {
        input_amount: fields[0],
        output_amount: fields[1],
        is_pending: fields[2] == 1,
    }
}

fn serialiseSwap(swap: Swap) -> [Field; SWAP_SERIALISED_LEN] {
    [swap.input_amount, swap.output_amount, swap.is_pending as Field]
}

impl Swap {

  fn is_pending(self: Self) -> bool {
    self.output_amount == 0
  }

  fn serialise(self: Self) -> [Field; SWAP_SERIALISED_LEN] {
    serialiseSwap(self)
  }

  fn deserialise(fields: [Field; SWAP_SERIALISED_LEN]) -> Self {
    deserialiseSwap(fields)
  }
}

global SwapSerialisationMethods = TypeSerialisationInterface {
    serialise: serialiseSwap,
    deserialise: deserialiseSwap,
};

struct Storage {
    swap_notes: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
    swap_count: Map<Map<PublicState<Field, FIELD_SERIALISED_LEN>>>,
    swaps: Map<Map<Map<PublicState<Swap, SWAP_SERIALISED_LEN>>>>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            swap_notes: Map::new(1, |s1| PublicState::new(s1, FieldSerialisationMethods)),
            swap_count: Map::new(2, |s1| Map::new(s1, |s2| PublicState::new(s2, FieldSerialisationMethods))),
            swaps: Map::new(3, |s1| Map::new(s1, |s2| Map::new(s2, |s3| PublicState::new(s3, SwapSerialisationMethods)))),
        }
    }
}