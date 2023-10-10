use dep::aztec::context::{PrivateContext, PublicContext, Context};
use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::types::type_serialization::TypeSerializationInterface;
use dep::aztec::oracle::storage::{storage_read, storage_write};

use dep::std::option::Option;

use dep::std::merkle::compute_merkle_root;

// TODO: Need a couple of tests to check when updates are happening exactly at the point of change.
// If it updates when happening on point of change, then slow updates might change mid block which is a little funky.
// < and <= really matter here.

global EPOCH_LENGTH: u120 = 100;

fn compute_next_change(time: Field) -> Field {
  (((time as u120 / EPOCH_LENGTH + 1) * EPOCH_LENGTH)) as Field
}

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

impl Leaf {
  pub fn serialize(self: Self) -> [Field; 3] {
    serialize_leaf(self)
  }
  pub fn deserialize(serialized: [Field; 3]) -> Self {
    deserialize_leaf(serialized)
  }
}

struct RootObject {
  next_change: Field,
  before: Field,
  after: Field,
}

fn serialize_root_object(inner: RootObject) -> [Field; 3] {
  [inner.next_change, inner.before, inner.after]
}

fn deserialize_root_object(serialized: [Field; 3]) -> RootObject {
  RootObject {
    next_change: serialized[0],
    before: serialized[1],
    after:  serialized[2],
  }
}

impl RootObject {
  pub fn serialize(self: Self) -> [Field; 3] {
    serialize_root_object(self)
  }
}


// A single inclusion proof.
struct MembershipProof {
    index: Field,
    value: Field,
    sibling_path: [Field; 4],
}

impl MembershipProof {
    pub fn serialize(self: Self) -> pub [Field; 6] {
        [
            self.index,
            self.value,
            self.sibling_path[0],
            self.sibling_path[1],
            self.sibling_path[2],
            self.sibling_path[3],
        ]
    }

    pub fn deserialize(serialized: [Field; 6]) -> pub Self {
        MembershipProof {
            index: serialized[0],
            value: serialized[1],
            sibling_path: [
                serialized[2],
                serialized[3],
                serialized[4],
                serialized[5],
            ],
        }
    }
}

struct SlowUpdateInner {
  value: Field, // Value only really used for the private flow though :thinking:
  sibling_path: [Field; 4],
}

struct SlowUpdateProof {
  index: Field,
  new_value: Field,
  before: SlowUpdateInner,
  after: SlowUpdateInner,
}

impl SlowUpdateProof {
  pub fn serialize(self: Self) -> pub [Field; 12] {
    [
      self.index,
      self.new_value,
      self.before.value,
      self.before.sibling_path[0],
      self.before.sibling_path[1],
      self.before.sibling_path[2],
      self.before.sibling_path[3],
      self.after.value,
      self.after.sibling_path[0],
      self.after.sibling_path[1],
      self.after.sibling_path[2],
      self.after.sibling_path[3],
    ]
  }

  pub fn deserialize(serialized: [Field; 12]) -> pub Self {
    Self {
      index: serialized[0],
      new_value: serialized[1],
      before: SlowUpdateInner {
        value: serialized[2],
        sibling_path: [
          serialized[3],
          serialized[4],
          serialized[5],
          serialized[6],
        ],
      },
      after: SlowUpdateInner {
        value: serialized[7],
        sibling_path: [
          serialized[8],
          serialized[9],
          serialized[10],
          serialized[11],
        ],
      },
    }
  }
}

struct SlowMap {
  context: Context,
  storage_slot: Field
}

impl SlowMap {
  pub fn new(
    context: Context,
    storage_slot: Field
  ) -> Self {
    assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
    Self {
      context,
      storage_slot,
    }
  }

  pub fn read_inner(self: Self) -> RootObject {
    storage_read(self.storage_slot, deserialize_root_object)
  }

  pub fn initialize(self: Self, root: Field) {
    let mut inner = self.read_inner();
    assert(inner.next_change == 0, "cannot initialize twice");
    inner = RootObject {
      next_change: 0xffffffffffffffffffffffffffffff,
      before: root,
      after: root,
    };
    let fields = serialize_root_object(inner);
    storage_write(self.storage_slot, fields);
  }

  pub fn current_root(self: Self) -> Field {
    let time = self.context.public.unwrap().timestamp() as u120;
    let inner = self.read_inner();
    // We return before when at the change to ensure multiple updates in the same block don't happen.
    if time <= inner.next_change as u120 {
      inner.before
    } else {
      inner.after
    }
  }

  pub fn read_leaf_at(self: Self, key: Field) -> Leaf {
    let derived_storage_slot = dep::std::hash::pedersen([self.storage_slot, key])[0];
    storage_read(derived_storage_slot, deserialize_leaf)
  }

  pub fn read_at(self: Self, key: Field) -> Field {
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
  pub fn update_at(self: Self, p: SlowUpdateProof) {
    // TODO: Constrain the index to be within the tree.

    let time = self.context.public.unwrap().timestamp() as u120;
    let next_change = compute_next_change(time as Field);

    let mut inner = self.read_inner();
    let mut leaf = self.read_leaf_at(p.index);

    // Move leaf if needed
    if time > leaf.next_change as u120 {
      leaf.before = leaf.after; 
    }
    
    // Move root if needed
    if time > inner.next_change as u120 {
      inner.before = inner.after;
    }

    assert(
      inner.before == compute_merkle_root(leaf.before, p.index, p.before.sibling_path), 
      "Before root don't match"
    );

    // Need to ensure that any pending stuff was not removed. If no pending, this root should match above.
    assert(
      inner.after == compute_merkle_root(leaf.after, p.index, p.after.sibling_path), 
      "After root don't match"
    );

    // Update the leaf 
    leaf.after = p.new_value;
    leaf.next_change = next_change;

    // Update the after root
    inner.after = compute_merkle_root(leaf.after, p.index, p.after.sibling_path);
    inner.next_change = next_change;

    self.update_unsafe(p.index, leaf, inner);
  }

  // Useful for using private function to check values and then public to update.
  pub fn update_unsafe_at(self: Self, index: Field, leaf_value: Field, new_root: Field) {
    // User must ensure that the checks from update_at is performed for safety
    let time = self.context.public.unwrap().timestamp() as u120;
    let next_change = compute_next_change(time as Field);

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

    // Update the leaf 
    leaf.after = leaf_value;
    leaf.next_change = next_change;
    
    // Update the inner
    inner.after = new_root;
    inner.next_change = next_change;

    self.update_unsafe(index, leaf, inner);
  }

  fn update_unsafe(self: Self, index: Field, leaf: Leaf, inner: RootObject) {
    let derived_storage_slot = dep::std::hash::pedersen([self.storage_slot, index])[0];
    let fields = serialize_leaf(leaf);
    storage_write(derived_storage_slot, fields);
    
    // Update the inner
    let fields = serialize_root_object(inner);
    storage_write(self.storage_slot, fields);
  }

}
