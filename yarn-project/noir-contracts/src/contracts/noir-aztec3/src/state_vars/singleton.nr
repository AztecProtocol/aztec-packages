use dep::std;
use crate::abi::Inputs;
use crate::context::PrivateFunctionContext;
use crate::notes::owner_note::OwnerNote;
use crate::notes::note_interface::NoteInterface;
use crate::types::point::Point;
use crate::state_vars::note_getter_data::NoteGetterData;
use crate::state_vars::note_getter_data::make_note_getter_data;
use crate::state_vars::note_getter_data::note_getter_data_len;

// STUB
fn get_note<Note>(storage_slot: Field, dummy: fn()->Note) -> NoteGetterData<Note> {
    let note = dummy();
    let leaf_index = storage_slot;
    let sibling_path = [1, 2, 3, 4, 5, 6, 7, 8];
    let root = 1;
    let data1 = NoteGetterData {
        note,
        leaf_index,
        sibling_path,
        root,
    };
    data1
}

fn silo_note_hash_with_storage_slot(storage_slot: Field, note_hash: Field) -> Field {
    dep::std::hash::pedersen([
        crate::NOTE_HASH_WITH_STORAGE_SLOT_GENERATOR,
        storage_slot,
        note_hash
    ])[0]
}

fn silo_note_hash(contract_address: Field, storage_slot: Field, note_hash: Field) -> Field {
    let note_hash_with_storage_slot = silo_note_hash_with_storage_slot(note_hash, storage_slot);
    
    dep::std::hash::pedersen([
        crate::SILOED_NOTE_HASH_GENERATOR,
        contract_address,
        note_hash_with_storage_slot,
    ])[0]
}

struct Singleton<Note, N> {
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>
}

impl<Note, N> Singleton<Note, N> {
    fn new(storage_slot: Field, note_interface: NoteInterface<Note, N>) -> Self {
        Singleton { storage_slot, note_interface }
    }

    // Prevents this singleton from ever being initialised again.
    fn initialise(self, mut context: PrivateFunctionContext) -> PrivateFunctionContext {
        let initialisation_nullifier = dep::std::hash::pedersen([
            crate::SINGLETON_INITIALISATION_GENERATOR,
            self.storage_slot
        ])[0];
        context.push_new_nullifier(initialisation_nullifier)
    }

    fn insert(self, mut context: PrivateFunctionContext, note: Note) -> PrivateFunctionContext {
        let storage_slot = self.storage_slot;
        let note_interface = self.note_interface;
        let compute_note_hash = note_interface.compute_note_hash;
        let note_hash = compute_note_hash(note);
        // let note_hash_with_storage_slot = silo_note_hash_with_storage_slot(storage_slot, note_hash);

        // assert notify_created_note(storage_slot, note.owner, note) == 0;
        // context.push_new_note_hash(note_hash_with_storage_slot)
        context.push_new_note_hash(storage_slot + note_hash)
    }

    fn get(self, inputs: Inputs, mut context: PrivateFunctionContext) -> (PrivateFunctionContext, Note) {
        let storage_slot = self.storage_slot;

        let dummy = self.note_interface.dummy;
        let note_getter_data = get_note(storage_slot, dummy);

        assert (note_getter_data.root == inputs.old_private_data_tree_root);

        (context, note_getter_data.note)
    }


    fn remove(self, inputs: Inputs, mut context: PrivateFunctionContext, note: Note) -> PrivateFunctionContext {
        let contract_address = inputs.call_context.storage_contract_address;
        let storage_slot = self.storage_slot;

        let compute_note_hash = self.note_interface.compute_note_hash;
        let note_hash = compute_note_hash(note);

        let siloed_note_hash = silo_note_hash(contract_address, storage_slot, note_hash);

        let compute_nullifier = self.note_interface.compute_nullifier;
        let nullifier = compute_nullifier(note, siloed_note_hash);

        // assert notify_nullified_note(storage_slot, nullifier, note) == 0;
        context.push_new_nullifier(nullifier)
    }
}

fn insert<Note, N>(singleton: Singleton<Note, N>, mut context: PrivateFunctionContext, note: Note) -> PrivateFunctionContext {
    let storage_slot = singleton.storage_slot;

    let compute_note_hash = singleton.note_interface.compute_note_hash;
    let note_hash = compute_note_hash(note);
    let note_hash_with_storage_slot = silo_note_hash_with_storage_slot(storage_slot, note_hash);

    // assert notify_created_note(storage_slot, note.owner, note) == 0;
    context.push_new_note_hash(note_hash_with_storage_slot)
}
