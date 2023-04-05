use dep::std;
use crate::abi::Inputs;
use crate::abi::IntermediateOutputs;
use crate::notes::value_note::Note;
use crate::notes::generic_note_functions::GenericNoteFunctions;
use crate::notes::value_note::get_value_note_functions;
use crate::types::point::Point;
use crate::state_vars::note_getter_data::NoteGetterData;


#[builtin(notifyCreatedNote)]
fn notify_created_note<T>(
    _storage_slot: Field,
    _note: T,
) -> Field {}

#[builtin(notifyNullifiedNote)]
fn notify_nullified_note<T>(
    _storage_slot: Field,
    _nullifier: Field,
    _note: T,
) -> Field {}

#[builtin(getNotes2)]
fn get_notes_2_internal(
    _contract_address: Field,
    _storage_slot: Field,
) -> [Field] {}

// fn make_note_getter_data<Note>(fields: [Field], start: comptime Field) -> NoteGetterData<Note> {
//     NoteGetterData<Note> {
//         note: Note {
//             value: fields[start],
//             owner: Point::new(fields[start + 1], fields[start + 2]),
//             randomness: fields[start + 3],
//             nonce: fields[start + 4],
//             is_dummy: fields[start + 5] as bool,
//         },
//         leaf_index: fields[start + 6],
//         sibling_path: [
//             fields[start + 7],
//             fields[start + 8],
//             fields[start + 9],
//             fields[start + 10],
//             fields[start + 11],
//         ],
//         root: fields[start + 12],
//     }
// }

fn get_2_notes<N, T, NoteGetterData>(
    contract_address: Field,
    storage_slot: Field,
    note_from_fields: fn ([Field; N], comptime Field) -> T,
    note_getter_data_from_fields: fn ([Field], comptime Field, fn ([Field; N], comptime Field) -> T) -> NoteGetterData
) -> (NoteGetterData, NoteGetterData) {
    let notes_as_fields = get_notes_2_internal(contract_address, storage_slot);
    let data1 = note_getter_data_from_fields(notes_as_fields, 0, note_from_fields);
    let data2 = note_getter_data_from_fields(notes_as_fields, 13, note_from_fields);
    (data1, data2)
}


struct Set<T, N> {
    storage_slot: Field,
    note_functions: GenericNoteFunctions<T, N>,
}

impl<T, N> Set<T, N> {
    fn new(storage_slot: Field, note_functions: GenericNoteFunctions<T, N>) -> Self {
        Self { storage_slot, note_functions }
    }

    fn insert(
        self,
        inputs: Inputs,
        mut outputs: IntermediateOutputs,
        note: T,
    ) -> IntermediateOutputs {
        let contract_address = inputs.call_context.storage_contract_address;
        let storage_slot = self.storage_slot;

        let compute_note_hash = self.note_functions.compute_note_hash;
        let to_fields = self.note_functions.to_fields;

        let note_hash = compute_note_hash(note);
        let siloed_note_hash = dep::std::hash::pedersen([
            crate::NoteStorageSlot,
            note_hash, 
            storage_slot, 
            contract_address,
        ])[0];

        constrain notify_created_note(storage_slot, note) == 0;
        outputs = outputs.push_new_note_hash(siloed_note_hash);
        outputs.push_new_note(note, to_fields)
    }

    // The `2` in the name is the number of notes returned
    fn get_2(
        self,
        inputs: Inputs,
        mut outputs: IntermediateOutputs,
    ) -> (IntermediateOutputs, (T, T)) {
        let contract_address = inputs.call_context.storage_contract_address;
        let storage_slot = self.storage_slot;

        // let note_getter_data: [NoteGetterData; 2] = ORACLE::get_2_notes(contract_address, storage_slot);
        // let note_getter_data = (
        //     NoteGetterData { note: Note::dummy(), leaf_index: 0, sibling_path: [1, 2, 3, 4, 5], root: 1 },
        //     NoteGetterData { note: Note::dummy(), leaf_index: 1, sibling_path: [1, 2, 3, 4, 5], root: 1 },
        // );
        let f = NoteGetterData::from_fields;
        let note_getter_data = get_2_notes(contract_address, storage_slot, self.note_functions.from_fields, f);

        // Forwarded vars added due to https://github.com/noir-lang/noir/issues/1088
        let process_data = |data, storage_slot_forwarded, contract_address_forwarded| {
            let NoteGetterData { note, leaf_index, sibling_path, root } = data;
            let _ignored = sibling_path;

            let compute_note_hash = self.note_functions.compute_note_hash;
            let note_hash = compute_note_hash(note);
            let siloed_note_hash = dep::std::hash::pedersen([
                crate::NoteStorageSlot,
                note_hash, 
                storage_slot_forwarded, 
                contract_address_forwarded
            ])[0];

            // Check existence in tree:
            constrain std::merkle::check_membership(
                root,
                siloed_note_hash,
                leaf_index,
                sibling_path,
            ) == 1;

            // Set the public input of the 'old private data tree root' to be the computed root (if it hasn't already been set); otherwise constrain equality with the previously-set value.
            if outputs.old_private_data_tree_root == 0 {
                outputs.old_private_data_tree_root = root;
            } else {
                constrain outputs.old_private_data_tree_root == root;
            }
        };
        process_data(note_getter_data.0, storage_slot, contract_address);
        process_data(note_getter_data.1, storage_slot, contract_address);

        let notes = (note_getter_data.0.note, note_getter_data.1.note);
        (outputs, notes)
    }


    fn remove(
        self,
        inputs: Inputs,
        mut outputs: IntermediateOutputs,
        note: T,
    ) -> IntermediateOutputs {
        let contract_address = inputs.call_context.storage_contract_address;
        let storage_slot = self.storage_slot;

        let compute_note_hash = self.note_functions.compute_note_hash;
        let compute_nullifier = self.note_functions.compute_nullifier;
        let to_fields = self.note_functions.to_fields;

        let note_hash = compute_note_hash(note);
        let siloed_note_hash = dep::std::hash::pedersen([
            crate::NoteStorageSlot,
            note_hash,
            storage_slot,
            contract_address,
        ])[0];

        let nullifier = compute_nullifier(note, siloed_note_hash);

        constrain notify_nullified_note(storage_slot, nullifier, note) == 0;
        outputs = outputs.push_new_nullifier(nullifier);
        outputs.push_nullified_note(note, to_fields)
    }
}


// Specialisations:

fn new_value_note_set(storage_slot: Field) -> Set<Note, 6> {
    Set::new(storage_slot, get_value_note_functions())
}
