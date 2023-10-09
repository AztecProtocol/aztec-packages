use dep::aztec::context::{PrivateContext, PublicContext, Context};
use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::types::type_serialization::TypeSerializationInterface;
use dep::aztec::oracle::storage::{storage_read, storage_write};

use dep::std::option::Option;

struct Inner {
  next_change: Field,
  rootBefore: Field,
  rootAfter: Field,
}

fn serialize_inner(inner: Inner) -> [Field; 3] {
  [inner.next_change, inner.rootBefore, inner.rootAfter]
}

fn deserialize_inner(serialized: [Field; 3]) -> Inner {
  Inner {
    next_change: serialized[0],
    rootBefore: serialized[1],
    rootAfter: serialized[2],
  }
}

impl Inner {
  fn serialize(self: Self) -> [Field; 3] {
    serialize_inner(self)
  }
}

struct SlowStruct<T, T_SERIALIZED_LEN> {
  context: Context,
  storage_slot: Field,
  value_before_slot: Field,
  value_after_slot: Field,
  serialization_methods: TypeSerializationInterface<T, T_SERIALIZED_LEN>,
}

impl<T, T_SERIALIZED_LEN> SlowStruct<T, T_SERIALIZED_LEN> {
  fn new(
    context: Context,
    storage_slot: Field,
    serialization_methods: TypeSerializationInterface<T, T_SERIALIZED_LEN>
  ) -> Self {
    assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
    Self {
      context,
      storage_slot,
      value_before_slot: dep::std::hash::pedersen([storage_slot, 0x6265666f7265])[0], // H(slot, "before")
      value_after_slot: dep::std::hash::pedersen([storage_slot, 0x6166746572])[0],    // H(slot, "after")
      serialization_methods,
    }
  }

  fn read_inner(self: Self) -> Inner {
    storage_read(self.storage_slot, deserialize_inner)
  }

  fn compute_root(self: Self, value: T) -> Field {
    let serialize_fn = self.serialization_methods.serialize;
    let fields = serialize_fn(value);
    let root = dep::std::hash::pedersen(fields)[0];
    root
  }

  fn current_root(self: Self) -> Field {
    let time = self.context.public.unwrap().timestamp() as u120;
    let inner = self.read_inner();
    if time <= inner.next_change as u120 {
      inner.rootBefore
    } else {
      inner.rootAfter
    }
  }

  fn read_value(self: Self, before: bool) -> T {
    let slot = if before { self.value_before_slot } else { self.value_after_slot };
    storage_read(slot, self.serialization_methods.deserialize)
  }

  fn write_value(self: Self, before: bool, value: T) {
    let slot = if before { self.value_before_slot } else { self.value_after_slot };
    let serialize_fn = self.serialization_methods.serialize;
    let fields = serialize_fn(value);
    storage_write(slot, fields);
  }

  // @todo @LHerskind we can optimize the number of reads here.
  fn read(self) -> T {
    let time = self.context.public.unwrap().timestamp() as u120;
    let inner = self.read_inner();
    self.read_value(time <= inner.next_change as u120)
  }

  // Might be doing a LOT of writes in here. 3 + 2 * T_SERIALIZED_LEN at most.
  fn write(self: Self, value: T) {
    let time = self.context.public.unwrap().timestamp() as u120;
    let mut current_inner = self.read_inner();

    let serialize_fn = self.serialization_methods.serialize;

    if time > current_inner.next_change as u120 {
      // Update the current inner.
      let after = self.read_value(false);
      // before = after
      self.write_value(true, after);

      let root = dep::std::hash::pedersen(serialize_fn(after))[0];
      current_inner.rootBefore = root;
    }

    // after = value
    self.write_value(false, value);

    // compute the next change.
    // every time you update, you push the update path backwards
    // @todo @LHerskind should be changed to be consistent across many different 
    // but for quick testing, we'll just do this.
    current_inner.next_change = (((time / 100) * 100) + 100) as Field;
    current_inner.rootAfter = dep::std::hash::pedersen(serialize_fn(value))[0];

    let fields = serialize_inner(current_inner);
    storage_write(self.storage_slot, fields);
  }
}