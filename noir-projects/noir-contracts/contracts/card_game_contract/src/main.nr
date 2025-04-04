mod cards;
mod game;

use dep::aztec::macros::aztec;

#[aztec]
pub contract CardGame {
    use dep::aztec::{hash::pedersen_hash, state_vars::{Map, PublicMutable}};
    use dep::aztec::protocol_types::address::AztecAddress;

    use dep::aztec::note::constants::MAX_NOTES_PER_PAGE;

    use crate::cards::{Card, compute_deck_strength, Deck, get_pack_cards};
    use crate::game::{Game, PLAYABLE_CARDS, PlayerEntry};
    use dep::aztec::macros::{functions::{internal, private, public, utility}, storage::storage};

    use dep::aztec::protocol_types::traits::{FromField, ToField};

    #[storage]
    struct Storage<Context> {
        collections: Map<AztecAddress, Deck<Context>, Context>,
        game_decks: Map<Field, Map<AztecAddress, Deck<Context>, Context>, Context>,
        games: Map<Field, PublicMutable<Game, Context>, Context>,
    }

    #[private]
    fn buy_pack(
        seed: Field, // The randomness used to generate the cards. Passed in for now.
    ) {
        let buyer = context.msg_sender();
        let mut cards = get_pack_cards(seed, buyer, &mut context);

        let mut collection = storage.collections.at(buyer);
        let _inserted_cards = collection.add_cards(cards, buyer);
    }

    #[private]
    fn join_game(game: u32, cards_fields: [Field; 2]) {
        let cards = cards_fields.map(|card_field| Card::from_field(card_field));

        let player = context.msg_sender();

        let mut collection = storage.collections.at(player);
        collection.remove_cards(cards);
        let mut game_deck = storage.game_decks.at(game as Field).at(player);
        let _added_to_game_deck = game_deck.add_cards(cards, player);
        let strength = compute_deck_strength(cards);
        CardGame::at(context.this_address()).on_game_joined(game, player, strength as u32).enqueue(
            &mut context,
        );
    }

    #[public]
    #[internal]
    fn on_game_joined(game: u32, player: AztecAddress, deck_strength: u32) {
        let game_storage = storage.games.at(game as Field);

        let mut game_data = game_storage.read();
        assert(
            game_data.add_player(PlayerEntry { address: player, deck_strength, points: 0 }),
            "Game full",
        );

        game_storage.write(game_data);
    }

    #[public]
    fn start_game(game: u32) {
        let game_storage = storage.games.at(game as Field);

        let mut game_data = game_storage.read();
        game_data.start_game();
        game_storage.write(game_data);
    }

    #[private]
    fn play_card(game: u32, card: Card) {
        let player = context.msg_sender();

        let mut game_deck = storage.game_decks.at(game as Field).at(player);
        game_deck.remove_cards([card]);

        // docs:start:call_public_function
        CardGame::at(context.this_address()).on_card_played(game, player, card.to_field()).enqueue(
            &mut context,
        );
        // docs:end:call_public_function
    }

    #[public]
    #[internal]
    fn on_card_played(game: u32, player: AztecAddress, card_as_field: Field) {
        let game_storage = storage.games.at(game as Field);

        let mut game_data = game_storage.read();

        let card = Card::from_field(card_as_field);
        let current_player = game_data.current_player();
        assert(current_player.address.eq(player), "Not your turn");
        game_data.play_card(card);

        game_storage.write(game_data);
    }

    #[private]
    fn claim_cards(game: u32, cards_fields: [Field; PLAYABLE_CARDS]) {
        let player = context.msg_sender();
        let cards = cards_fields.map(|card_field| Card::from_field(card_field));

        let mut collection = storage.collections.at(player);
        let _inserted_cards = collection.add_cards(cards, player);
        CardGame::at(context.this_address())
            .on_cards_claimed(game, player, pedersen_hash(cards_fields, 0))
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn on_cards_claimed(game: u32, player: AztecAddress, cards_hash: Field) {
        let game_storage = storage.games.at(game as Field);
        let mut game_data = game_storage.read();

        assert(!game_data.claimed, "Already claimed");
        game_data.claimed = true;

        assert_eq(
            cards_hash,
            pedersen_hash(game_data.rounds_cards.map(|card: Card| card.to_field()), 0),
        );

        let winner = game_data.winner();
        assert(player.eq(winner.address), "Not the winner");

        game_storage.write(game_data);
    }

    #[utility]
    unconstrained fn view_collection_cards(
        owner: AztecAddress,
        offset: u32,
    ) -> BoundedVec<Card, MAX_NOTES_PER_PAGE> {
        let collection = storage.collections.at(owner);
        collection.view_cards(offset)
    }

    #[utility]
    unconstrained fn view_game_cards(
        game: u32,
        player: AztecAddress,
        offset: u32,
    ) -> BoundedVec<Card, MAX_NOTES_PER_PAGE> {
        let game_deck = storage.game_decks.at(game as Field).at(player);

        game_deck.view_cards(offset)
    }

    #[utility]
    unconstrained fn view_game(game: u32) -> Game {
        storage.games.at(game as Field).read()
    }
}
