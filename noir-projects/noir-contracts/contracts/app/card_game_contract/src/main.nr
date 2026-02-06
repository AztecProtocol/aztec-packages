mod cards;
mod game;

use dep::aztec::macros::aztec;

#[aztec]
pub contract CardGame {
    use dep::aztec::protocol::address::AztecAddress;
    use dep::aztec::protocol::hash::poseidon2_hash;
    use dep::aztec::state_vars::{Map, PublicMutable};

    use dep::aztec::note::constants::MAX_NOTES_PER_PAGE;

    use crate::cards::{Card, compute_deck_strength, Deck, get_pack_cards};
    use crate::game::{Game, PLAYABLE_CARDS, PlayerEntry};
    use dep::aztec::macros::{functions::{external, only_self}, storage::storage};

    use dep::aztec::protocol::traits::{FromField, ToField};

    #[storage]
    struct Storage<CONTEXT> {
        collections: Deck<CONTEXT>,
        game_decks: Map<Field, Deck<CONTEXT>, CONTEXT>,
        games: Map<Field, PublicMutable<Game, CONTEXT>, CONTEXT>,
    }

    #[external("private")]
    fn buy_pack(
        seed: Field, // The randomness used to generate the cards. Passed in for now.
    ) {
        let buyer = self.msg_sender();
        let mut cards = get_pack_cards(seed, buyer, self.context);

        let mut collection = self.storage.collections;
        let _inserted_cards = collection.add_cards(cards, buyer);
    }

    #[external("private")]
    fn join_game(game: u32, cards_fields: [Field; 2]) {
        let cards = cards_fields.map(|card_field| Card::from_field(card_field));

        let player = self.msg_sender();

        let mut collection = self.storage.collections;
        collection.remove_cards(cards, player);
        let mut game_deck = self.storage.game_decks.at(game as Field);
        let _added_to_game_deck = game_deck.add_cards(cards, player);
        let strength = compute_deck_strength(cards);
        self.enqueue_self.on_game_joined(game, player, strength as u32);
    }

    #[external("public")]
    #[only_self]
    fn on_game_joined(game: u32, player: AztecAddress, deck_strength: u32) {
        let game_storage = self.storage.games.at(game as Field);

        let mut game_data = game_storage.read();
        assert(
            game_data.add_player(PlayerEntry { address: player, deck_strength, points: 0 }),
            "Game full",
        );

        game_storage.write(game_data);
    }

    #[external("public")]
    fn start_game(game: u32) {
        let game_storage = self.storage.games.at(game as Field);

        let mut game_data = game_storage.read();
        game_data.start_game();
        game_storage.write(game_data);
    }

    #[external("private")]
    fn play_card(game: u32, card: Card) {
        let player = self.msg_sender();

        let mut game_deck = self.storage.game_decks.at(game as Field);
        game_deck.remove_cards([card], player);

        self.enqueue_self.on_card_played(game, player, card.to_field());
    }

    #[external("public")]
    #[only_self]
    fn on_card_played(game: u32, player: AztecAddress, card_as_field: Field) {
        let game_storage = self.storage.games.at(game as Field);

        let mut game_data = game_storage.read();

        let card = Card::from_field(card_as_field);
        let current_player = game_data.current_player();
        assert(current_player.address.eq(player), "Not your turn");
        game_data.play_card(card);

        game_storage.write(game_data);
    }

    #[external("private")]
    fn claim_cards(game: u32, cards_fields: [Field; PLAYABLE_CARDS]) {
        let player = self.msg_sender();
        let cards = cards_fields.map(|card_field| Card::from_field(card_field));

        let mut collection = self.storage.collections;
        let _inserted_cards = collection.add_cards(cards, player);
        self.enqueue_self.on_cards_claimed(game, player, poseidon2_hash(cards_fields));
    }

    #[external("public")]
    #[only_self]
    fn on_cards_claimed(game: u32, player: AztecAddress, cards_hash: Field) {
        let game_storage = self.storage.games.at(game as Field);
        let mut game_data = game_storage.read();

        assert(!game_data.claimed, "Already claimed");
        game_data.claimed = true;

        assert_eq(
            cards_hash,
            poseidon2_hash(game_data.rounds_cards.map(|card: Card| card.to_field())),
        );

        let winner = game_data.winner();
        assert(player.eq(winner.address), "Not the winner");

        game_storage.write(game_data);
    }

    #[external("utility")]
    unconstrained fn view_collection_cards(
        owner: AztecAddress,
        offset: u32,
    ) -> BoundedVec<Card, MAX_NOTES_PER_PAGE> {
        let collection = self.storage.collections;
        collection.view_cards(owner, offset)
    }

    #[external("utility")]
    unconstrained fn view_game_cards(
        game: u32,
        player: AztecAddress,
        offset: u32,
    ) -> BoundedVec<Card, MAX_NOTES_PER_PAGE> {
        let game_deck = self.storage.game_decks.at(game as Field);

        game_deck.view_cards(player, offset)
    }

    #[external("utility")]
    unconstrained fn view_game(game: u32) -> Game {
        self.storage.games.at(game as Field).read()
    }
}
