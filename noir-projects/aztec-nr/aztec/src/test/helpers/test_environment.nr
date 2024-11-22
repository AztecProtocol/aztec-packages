use dep::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress};

use crate::context::{
    call_interfaces::CallInterface, PrivateContext, PublicContext, UnconstrainedContext,
};
use crate::hash::hash_args;
use crate::test::helpers::{cheatcodes, utils::Deployer};

use crate::note::{note_header::NoteHeader, note_interface::{NoteInterface, NullifiableNote}};
use crate::oracle::{
    execution::{get_block_number, get_contract_address},
    notes::notify_created_note,
};
use protocol_types::constants::PUBLIC_DISPATCH_SELECTOR;

pub struct TestEnvironment {}

impl TestEnvironment {
    pub unconstrained fn new() -> Self {
        cheatcodes::reset();
        Self {}
    }

    pub unconstrained fn block_number(_self: Self) -> u32 {
        get_block_number()
    }

    pub unconstrained fn contract_address(_self: Self) -> AztecAddress {
        get_contract_address()
    }

    pub unconstrained fn impersonate(_self: Self, address: AztecAddress) {
        cheatcodes::set_contract_address(address)
    }

    pub unconstrained fn advance_block_to(&mut self, block_number: u32) {
        let difference = block_number - get_block_number();
        self.advance_block_by(difference);
    }

    pub unconstrained fn advance_block_by(_self: &mut Self, blocks: u32) {
        cheatcodes::advance_blocks_by(blocks);
    }

    pub unconstrained fn public(_self: Self) -> PublicContext {
        PublicContext::new(|| 0)
    }

    pub unconstrained fn public_with_args_hash(_self: Self, args: [Field]) -> PublicContext {
        let mut context = PublicContext::new(|| panic(f"Provide args hash manually"));
        context.args_hash = Option::some(hash_args(args));
        context
    }

    pub unconstrained fn private(&mut self) -> PrivateContext {
        self.private_at(get_block_number() - 1)
    }

    // unconstrained is a key word, so we mis-spell purposefully here, like we do with contrakt
    pub unconstrained fn unkonstrained(_self: Self) -> UnconstrainedContext {
        UnconstrainedContext::new()
    }

    pub unconstrained fn private_at(&mut self, historical_block_number: u32) -> PrivateContext {
        if historical_block_number >= get_block_number() {
            self.advance_block_to(historical_block_number + 1);
        }

        let mut inputs = cheatcodes::get_private_context_inputs(historical_block_number);

        PrivateContext::new(inputs, 0)
    }

    pub unconstrained fn create_account(_self: Self) -> AztecAddress {
        let test_account = cheatcodes::create_account();
        test_account.address
    }

    pub unconstrained fn create_account_contract(&mut self, secret: Field) -> AztecAddress {
        let test_account = cheatcodes::add_account(secret);
        let address = test_account.address;
        cheatcodes::advance_blocks_by(1);

        let selector = FunctionSelector::from_signature("constructor(Field,Field)");

        let mut context = self.private_at(get_block_number());
        let args = [test_account.keys.ivpk_m.inner.x, test_account.keys.ivpk_m.inner.y];
        let _ = context.call_private_function(address, selector, args);

        address
    }

    pub unconstrained fn deploy<let N: u32, let M: u32>(
        _self: Self,
        path: str<N>,
        name: str<M>,
    ) -> Deployer<N, M> {
        Deployer { path, name, public_keys_hash: 0 }
    }

    pub unconstrained fn deploy_self<let M: u32>(_self: Self, name: str<M>) -> Deployer<0, M> {
        Deployer { path: "", name, public_keys_hash: 0 }
    }

    pub unconstrained fn assert_public_call_fails<C, let M: u32>(_self: Self, call_interface: C)
    where
        C: CallInterface<M>,
    {
        // Public functions are routed through the dispatch function.
        let fn_selector = FunctionSelector::from_field(PUBLIC_DISPATCH_SELECTOR);
        let calldata =
            &[call_interface.get_selector().to_field()].append(call_interface.get_args());
        cheatcodes::assert_public_call_fails(
            call_interface.get_contract_address(),
            fn_selector,
            calldata,
        );
    }

    pub unconstrained fn assert_private_call_fails<C, let M: u32>(_self: Self, call_interface: C)
    where
        C: CallInterface<M>,
    {
        cheatcodes::assert_private_call_fails(
            call_interface.get_contract_address(),
            call_interface.get_selector(),
            hash_args(call_interface.get_args()),
            cheatcodes::get_side_effects_counter() as Field,
            call_interface.get_is_static(),
        );
    }

    /// Manually adds a note to TXE. This needs to be called if you want to work with a note in your test with the note
    /// not having an encrypted log emitted. TXE alternative to `PXE.addNote(...)`.
    pub unconstrained fn add_note<Note, let N: u32>(
        _self: Self,
        note: &mut Note,
        storage_slot: Field,
        contract_address: AztecAddress,
    )
    where
        Note: NoteInterface<N> + NullifiableNote,
    {
        let original_contract_address = get_contract_address();
        cheatcodes::set_contract_address(contract_address);
        let note_hash_counter = cheatcodes::get_side_effects_counter();

        let header = NoteHeader { contract_address, storage_slot, nonce: 0, note_hash_counter };
        note.set_header(header);
        let note_hash = note.compute_note_hash();
        let serialized_note = Note::serialize_content(*note);
        notify_created_note(
            storage_slot,
            Note::get_note_type_id(),
            serialized_note,
            note_hash,
            note_hash_counter,
        );
        cheatcodes::set_contract_address(original_contract_address);
    }
}
