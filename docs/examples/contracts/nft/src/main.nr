// docs:start:contract_setup
use aztec::macros::aztec;
pub mod nft;

#[aztec]
pub contract NFTPunk {
    use crate::nft::NFTNote;
    use aztec::{
        macros::{functions::{external, initializer, only_self}, storage::storage},
        protocol::address::AztecAddress,
        state_vars::{DelayedPublicMutable, Map, Owned, PrivateSet, PublicImmutable},
    };
    use aztec::messages::delivery::MessageDelivery;
    use aztec::note::{
        note_getter_options::NoteGetterOptions, note_interface::NoteProperties,
        note_viewer_options::NoteViewerOptions,
    };
    use aztec::utils::comparison::Comparator;

    #[storage]
    struct Storage<Context> {
        admin: PublicImmutable<AztecAddress, Context>,
        minter: PublicImmutable<AztecAddress, Context>,
        nfts: Map<Field, DelayedPublicMutable<bool, 2u64, Context>, Context>,
        owners: Owned<PrivateSet<NFTNote, Context>, Context>,
    }
    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        self.storage.admin.initialize(admin);
    }
    // docs:end:contract_setup

    // docs:start:set_minter
    #[external("public")]
    fn set_minter(minter: AztecAddress) {
        assert(self.storage.admin.read().eq(self.msg_sender()), "caller is not admin");
        self.storage.minter.initialize(minter);
    }
    // docs:end:set_minter

    // docs:start:mark_nft_exists
    #[external("public")]
    #[only_self]
    fn _mark_nft_exists(token_id: Field, exists: bool) {
        self.storage.nfts.at(token_id).schedule_value_change(exists);
    }
    // docs:end:mark_nft_exists

    // docs:start:mint
    #[external("private")]
    fn mint(to: AztecAddress, token_id: Field) {
        assert(
            self.storage.minter.read().eq(self.msg_sender()),
            "caller is not the authorized minter",
        );

        // we create an NFT note and insert it to the PrivateSet - a collection of notes meant to be read in private
        let new_nft = NFTNote { token_id };
        self.storage.owners.at(to).insert(new_nft).deliver(MessageDelivery::onchain_unconstrained());

        // calling the internal public function above to indicate that the NFT is taken
        self.enqueue_self._mark_nft_exists(token_id, true);
    }
    // docs:end:mint

    // docs:start:notes_of
    #[external("utility")]
    unconstrained fn notes_of(from: AztecAddress) -> Field {
        let notes = self.storage.owners.at(from).view_notes(NoteViewerOptions::new());
        notes.len() as Field
    }
    // docs:end:notes_of

    // docs:start:burn
    #[external("private")]
    fn burn(from: AztecAddress, token_id: Field) {
        assert(
            self.storage.minter.read().eq(self.msg_sender()),
            "caller is not the authorized minter",
        );

        // from the NFTNote properties, selects token_id and compares it against the token_id to be burned
        let options = NoteGetterOptions::new()
            .select(NFTNote::properties().token_id, Comparator.EQ, token_id)
            .set_limit(1);
        let notes = self.storage.owners.at(from).pop_notes(options);
        assert(notes.len() == 1, "NFT not found");

        self.enqueue_self._mark_nft_exists(token_id, false);
    }
    // docs:end:burn
}
