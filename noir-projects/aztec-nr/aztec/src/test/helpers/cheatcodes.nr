use dep::protocol_types::{abis::function_selector::FunctionSelector, address::{AztecAddress, PartialAddress}};
use crate::context::inputs::{PublicContextInputs, PrivateContextInputs};
use crate::test::helpers::types::{Deployer, TestAccount};
use crate::keys::public_keys::PublicKeys;
use crate::note::{
    note_header::NoteHeader, note_interface::NoteInterface,
    utils::{compute_note_hash_for_insertion, compute_note_hash_for_consumption}
};
use crate::oracle::notes::notify_created_note;

unconstrained pub fn reset() {
    oracle_reset();
}

unconstrained pub fn get_contract_address() -> AztecAddress {
    oracle_get_contract_address()
}

unconstrained pub fn set_contract_address(address: AztecAddress) {
    oracle_set_contract_address(address);
}

unconstrained pub fn get_block_number() -> u32 {
    oracle_get_block_number()
}

unconstrained pub fn advance_blocks(blocks: u32) {
    oracle_time_travel(blocks);
}

unconstrained pub fn get_private_context_inputs(historical_block_number: u32) -> PrivateContextInputs {
    oracle_get_private_context_inputs(historical_block_number)
}

unconstrained pub fn get_public_context_inputs() -> PublicContextInputs {
    oracle_get_public_context_inputs()
}

unconstrained pub fn deploy<N, M>(
    path: str<N>,
    initializer: str<M>,
    args: [Field],
    public_keys_hash: Field
) -> AztecAddress {
    oracle_deploy(path, initializer, args, public_keys_hash)
}

unconstrained pub fn direct_storage_write<N>(
    contract_address: AztecAddress,
    storage_slot: Field,
    fields: [Field; N]
) {
    let _hash = direct_storage_write_oracle(contract_address, storage_slot, fields);
}

unconstrained pub fn create_account() -> TestAccount {
    oracle_create_account()
}

unconstrained pub fn add_account(secret: Field, partial_address: PartialAddress) -> TestAccount {
    oracle_add_account(secret, partial_address)
}

unconstrained pub fn derive_keys(secret: Field) -> PublicKeys {
    oracle_derive_keys(secret)
}

unconstrained pub fn set_msg_sender(msg_sender: AztecAddress) {
    oracle_set_msg_sender(msg_sender)
}

unconstrained pub fn get_msg_sender() -> AztecAddress {
    oracle_get_msg_sender()
}

unconstrained fn get_side_effects_counter() -> u32 {
    oracle_get_side_effects_counter()
}

pub fn store_note_in_cache<Note, N, M>(
    note: &mut Note,
    storage_slot: Field,
    contract_address: AztecAddress
) where Note: NoteInterface<N, M> {
    let original_contract_address = get_contract_address();
    set_contract_address(contract_address);
    let note_hash_counter = get_side_effects_counter();

    let header = NoteHeader { contract_address, storage_slot, nonce: 0, note_hash_counter };
    // TODO: change this to note.set_header(header) once https://github.com/noir-lang/noir/issues/4095 is fixed
    Note::set_header(note, header);
    let inner_note_hash = compute_note_hash_for_insertion(*note);

    // TODO: Strong typing required because of https://github.com/noir-lang/noir/issues/4088
    let serialized_note: [Field; N] = Note::serialize_content(*note);
    assert(
        notify_created_note(
        storage_slot,
        Note::get_note_type_id(),
        serialized_note,
        inner_note_hash,
        note_hash_counter
    )
        == 0
    );
    set_contract_address(original_contract_address);
}

#[oracle(reset)]
fn oracle_reset() {}

#[oracle(getContractAddress)] 
fn oracle_get_contract_address() -> AztecAddress {}

#[oracle(setContractAddress)]
fn oracle_set_contract_address(address: AztecAddress) {}

#[oracle(getBlockNumber)]
fn oracle_get_block_number() -> u32 {}

#[oracle(timeTravel)]
fn oracle_time_travel(blocks: u32) {}

#[oracle(getPrivateContextInputs)]
fn oracle_get_private_context_inputs(historical_block_number: u32) -> PrivateContextInputs {}

#[oracle(getPublicContextInputs)]
fn oracle_get_public_context_inputs() -> PublicContextInputs {}

#[oracle(deploy)]
fn oracle_deploy<N, M>(
    path: str<N>,
    initializer: str<M>,
    args: [Field],
    public_keys_hash: Field
) -> AztecAddress {}

#[oracle(directStorageWrite)]
fn direct_storage_write_oracle<N>(
    _contract_address: AztecAddress,
    _storage_slot: Field,
    _values: [Field; N]
) -> [Field; N] {}

#[oracle(createAccount)]
fn oracle_create_account() -> TestAccount {}

#[oracle(addAccount)]
fn oracle_add_account(secret: Field, partial_address: PartialAddress) -> TestAccount {}

#[oracle(deriveKeys)]
fn oracle_derive_keys(secret: Field) -> PublicKeys {}

#[oracle(getMsgSender)]
fn oracle_get_msg_sender() -> AztecAddress {}

#[oracle(setMsgSender)]
fn oracle_set_msg_sender(msg_sender: AztecAddress) {}

#[oracle(getSideEffectsCounter)]
fn oracle_get_side_effects_counter() -> u32 {}
