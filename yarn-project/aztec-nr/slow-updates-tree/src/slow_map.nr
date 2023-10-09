use dep::aztec::context::{PrivateContext, PublicContext, Context};
use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::types::type_serialization::TypeSerializationInterface;
use dep::aztec::oracle::storage::{storage_read, storage_write};

use dep::std::option::Option;

use dep::std::merkle::compute_merkle_root;

// TODO: Need a couple of tests to check when updates are happening exactly at the point of change.
// If it updates when happening on point of change, then slow updates might change mid block which is a little funky.
// < and <= really matter here.

struct Leaf {
  next_change: Field,
  before: Field,
  after: Field,
}

fn serialize_leaf(leaf: Leaf) -> [Field; 3] {
  [leaf.next_change, leaf.before, leaf.after]
}

fn deserialize_leaf(serialized: [Field; 3]) -> Leaf {
  Leaf {
    next_change: serialized[0],
    before: serialized[1],
    after: serialized[2],
  }
}

struct Snapshot {
  root: Field,
}

struct RootObject {
  next_change: Field,
  before: Snapshot,
  after: Snapshot,
}

fn serialize_root_object(inner: RootObject) -> [Field; 3] {
  [inner.next_change, inner.before.root, inner.after.root]
}

fn deserialize_root_object(serialized: [Field; 3]) -> RootObject {
  RootObject {
    next_change: serialized[0],
    before: Snapshot {
      root: serialized[1],
    },
    after: Snapshot {
      root: serialized[2],
    }
  }
}

impl RootObject {
  fn serialize(self: Self) -> [Field; 3] {
    serialize_root_object(self)
  }
}

struct SlowMap {
  context: Context,
  storage_slot: Field
}

impl SlowMap {
  fn new(
    context: Context,
    storage_slot: Field
  ) -> Self {
    assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
    Self {
      context,
      storage_slot,
    }
  }

  fn read_inner(self: Self) -> RootObject {
    storage_read(self.storage_slot, deserialize_root_object)
  }

  fn initialize(self: Self, root: Field) {
    let mut inner = self.read_inner();
    assert(inner.next_change == 0);
    inner.before.root = root;
    inner.next_change = 0xffffffffffffffffffffffffffffff;
    let fields = serialize_root_object(inner);
    storage_write(self.storage_slot, fields);
  }

  fn current_snapshot(self: Self) -> Snapshot {
    let time = self.context.public.unwrap().timestamp() as u120;
    let inner = self.read_inner();
    // We return before when at the change to ensure multiple updates in the same block don't happen.
    if time <= inner.next_change as u120 {
      inner.before
    } else {
      inner.after
    }
  }

  fn read_leaf_at(self: Self, key: Field) -> Leaf {
    let derived_storage_slot = dep::std::hash::pedersen([self.storage_slot, key])[0];
    storage_read(derived_storage_slot, deserialize_leaf)
  }

  fn read_at(self: Self, key: Field) -> Field {
    let time = self.context.public.unwrap().timestamp() as u120;
    let leaf = self.read_leaf_at(key);
    if time <= leaf.next_change as u120 {
      leaf.before
    } else {
      leaf.after
    }
  }

  // This is just thrown together, not edge cases have been tested yet.
  // We really should not compute the roots in here with a merkle path.
  // For now, we just pass it along as apes. Ideally we would have it 
  // in a private function, but it makes it harder to use for the dev.
  // For now, performance is ignored and we just ape it.
  // We build a tiny tree with 4 leaves, for show.
  // We only update AFTER the `next_change` to not have multiple updates in the same block.
  // Should add size of trees making it easier to "add_next".
  fn update_at(self: Self, index: Field, leaf_value: Field, merkle_path: [Field; 4]) {
    // TODO: Constrain the index to be within the tree.

    let time = self.context.public.unwrap().timestamp() as u120;
    let next_change = (((time / 100) * 100) + 100) as Field;

    let mut inner = self.read_inner();
    let mut leaf = self.read_leaf_at(index);

    // Move leaf if needed
    if time > leaf.next_change as u120 {
      leaf.before = leaf.after; 
    }
    
    // Move root if needed
    if time > inner.next_change as u120 {
      inner.before = inner.after;
    }

    // Updating these outside of the if to handle the first update
    // Since non-updating writes are to be pruned in the kernel, we can just update this always.
    leaf.next_change = next_change;
    inner.next_change = next_change;

    let expected_root = compute_merkle_root(leaf.before, index, merkle_path);
    assert(inner.before.root == expected_root, "Merkle path does not match the expected root.");

    // Update the leaf 
    let derived_storage_slot = dep::std::hash::pedersen([self.storage_slot, index])[0];
    leaf.after = leaf_value;
    let fields = serialize_leaf(leaf);
    storage_write(derived_storage_slot, fields);
    
    // Update the inner
    inner.after.root = compute_merkle_root(leaf_value, index, merkle_path);
    let fields = serialize_root_object(inner);
    storage_write(self.storage_slot, fields);
  }
}