use crate::test::utils;
use crate::CardGame;

use dep::aztec::{prelude::AztecAddress, oracle::{unsafe_rand::unsafe_rand, execution::{get_chain_id, get_version, get_contract_address}}, test::helpers::cheatcodes};
use crate::cards::get_pack_cards;
use crate::cards::Card;
use crate::game::PlayerEntry;

#[test]
fn main() {
    let (env, card_game_contract_address, account_1, account_2) = utils::setup();

    let deck_seed = 27;

    env.impersonate(account_1);
    env.call_private_void(CardGame::at(card_game_contract_address).buy_pack(deck_seed));
    env.advance_block_by(1);

    let actual_cards = env.call_unconstrained(card_game_contract_address, || { CardGame::view_collection_cards(account_1, 0) });
    assert(actual_cards.len() == 3);
    assert(actual_cards.max_len() == 10);

    let mut private_context = env.private();

    let current_contract_address = get_contract_address();

    cheatcodes::set_contract_address(card_game_contract_address);
    let expected_cards: BoundedVec<Card, 10> = BoundedVec::from(get_pack_cards(deck_seed, account_1, &mut private_context));
    cheatcodes::set_contract_address(current_contract_address);

    assert(expected_cards.len() == 3);
    assert(expected_cards.max_len() == 10);

    for i in 0..3 {
      assert(expected_cards.any(|expected| {
        actual_cards.get(i).eq(expected)
      }));
    }
}


#[test]
unconstrained fn play_game() {
    let (env, card_game_contract_address, account_1, account_2) = utils::setup();

    let deck_seed = 27;
    let game_id = 42;

    env.impersonate(account_1);
    env.call_private_void(CardGame::at(card_game_contract_address).buy_pack(deck_seed));
    env.advance_block_by(1);

    env.impersonate(account_2);
    env.call_private_void(CardGame::at(card_game_contract_address).buy_pack(deck_seed));
    env.advance_block_by(1);

    env.impersonate(account_1);
    let actual_cards: BoundedVec<Card, 10> = env.call_unconstrained(card_game_contract_address, || { CardGame::view_collection_cards(account_1, 0) });
    env.call_private_void(CardGame::at(card_game_contract_address).join_game(game_id, [actual_cards.get(0).to_field(), actual_cards.get(1).to_field()]));
    env.advance_block_by(1);

    env.impersonate(account_2);
    env.assert_private_call_fails(CardGame::at(card_game_contract_address).join_game(game_id, [actual_cards.get(0).to_field(), actual_cards.get(1).to_field()]));
    env.advance_block_by(1);

    let actual_cards_after_joining_game = env.call_unconstrained(card_game_contract_address, || { CardGame::view_collection_cards(account_1, 0) });
    assert(actual_cards_after_joining_game.len() == 1);

    let one_player_game = env.call_unconstrained(card_game_contract_address, || { CardGame::view_game(game_id) });

    assert(
        (one_player_game.started == false) &
        (one_player_game.finished == false) &
        (one_player_game.claimed == false) &
        (one_player_game.current_player == 0)
    );

    assert(
        (one_player_game.players[0].address.eq(account_1)) &
        (one_player_game.players[0].deck_strength > 0) &
        (one_player_game.players[0].points == 0)
    );

    assert(
        (one_player_game.players[1].address.eq(AztecAddress::zero())) &
        (one_player_game.players[1].deck_strength == 0) &
        (one_player_game.players[1].points == 0)
    );


    env.impersonate(account_2);
    let actual_cards_account_2: BoundedVec<Card, 10> = env.call_unconstrained(card_game_contract_address, || { CardGame::view_collection_cards(account_2, 0) });
    env.call_private_void(CardGame::at(card_game_contract_address).join_game(game_id, [actual_cards_account_2.get(0).to_field(), actual_cards_account_2.get(1).to_field()]));
    env.advance_block_by(1);

    let actual_game_cards = [actual_cards, actual_cards_account_2];

    env.impersonate(account_1);
    env.call_public(CardGame::at(card_game_contract_address).start_game(game_id));
    env.advance_block_by(1);

    let started_game = env.call_unconstrained(card_game_contract_address, || { CardGame::view_game(game_id) });

    assert(
        (started_game.started == true) &
        (started_game.finished == false) &
        (started_game.claimed == false) &
        (started_game.current_player == 0)
    );

    assert(started_game.players.len() == 2);

    assert(started_game.players.any(|player: PlayerEntry| {
        (player.address.eq(account_1)) &
        (player.deck_strength > 0) &
        (player.points == 0)
    }));

    assert(started_game.players.any(|player: PlayerEntry| {
        (player.address.eq(account_2)) &
        (player.deck_strength > 0) &
        (player.points == 0)
    }));

    let first_to_move = if (started_game.players[0].address.eq(account_1)) {0} else {1};
    let second_to_move = (!(first_to_move as bool)) as Field;

    for i in 0..2 {
        env.impersonate(started_game.players[0].address);
        env.call_private_void(CardGame::at(card_game_contract_address).play_card(game_id, actual_game_cards[first_to_move].get(i)));
        env.advance_block_by(1);

        env.impersonate(started_game.players[1].address);
        env.call_private_void(CardGame::at(card_game_contract_address).play_card(game_id, actual_game_cards[second_to_move].get(i)));
        env.advance_block_by(1);
    }

    let finished_game = env.call_unconstrained(card_game_contract_address, || { CardGame::view_game(game_id) });

    assert(
        (finished_game.started == true) &
        (finished_game.finished == true) &
        (finished_game.claimed == false) &
        (finished_game.current_player == 0)
    );

    let (winner, loser) = if (finished_game.players[0].points > finished_game.players[1].points) {
        (finished_game.players[0].address, finished_game.players[1].address)
    } else {
        (finished_game.players[1].address, finished_game.players[0].address)
    };

    env.impersonate(loser);
    env.assert_private_call_fails(CardGame::at(card_game_contract_address).claim_cards(game_id, finished_game.rounds_cards.map(|card: Card| card.to_field())));
    env.advance_block_by(1);

    env.impersonate(winner);
    env.call_private_void(CardGame::at(card_game_contract_address).claim_cards(game_id, finished_game.rounds_cards.map(|card: Card| card.to_field())));
    env.advance_block_by(1);

    let actual_cards_after_winning_game = env.call_unconstrained(card_game_contract_address, || { CardGame::view_collection_cards(winner, 0) });
    assert(actual_cards_after_winning_game.len() == 5);

    env.impersonate(loser);
    env.call_private_void(CardGame::at(card_game_contract_address).buy_pack(deck_seed + 1));
    env.advance_block_by(1);

    let actual_cards_after_buying_back_in = env.call_unconstrained(card_game_contract_address, || { CardGame::view_collection_cards(loser, 0) });

    assert(actual_cards_after_buying_back_in.len() == 4);

    let actual_second_game_cards = [actual_cards_after_winning_game, actual_cards_after_buying_back_in];

    env.call_private_void(CardGame::at(card_game_contract_address).join_game(game_id + 1, [actual_cards_after_buying_back_in.get(0).to_field(), actual_cards_after_buying_back_in.get(1).to_field()]));
    env.advance_block_by(1);

    env.impersonate(winner);
    env.call_private_void(CardGame::at(card_game_contract_address).join_game(game_id + 1, [actual_cards_after_winning_game.get(3).to_field(), actual_cards_after_winning_game.get(4).to_field()]));
    env.advance_block_by(1);

    env.call_public(CardGame::at(card_game_contract_address).start_game(game_id + 1));
    env.advance_block_by(1);

    let second_started_game = env.call_unconstrained(card_game_contract_address, || { CardGame::view_game(game_id + 1) });

    for i in 0..2 {
        if (second_started_game.players[0].address.eq(winner)) {
            env.impersonate(winner);
            env.call_private_void(CardGame::at(card_game_contract_address).play_card(game_id + 1, actual_cards_after_winning_game.get(3 + i)));
            env.advance_block_by(1);

            env.impersonate(loser);
            env.call_private_void(CardGame::at(card_game_contract_address).play_card(game_id + 1, actual_cards_after_buying_back_in.get(i)));
            env.advance_block_by(1);
        } else {
            env.impersonate(loser);
            env.call_private_void(CardGame::at(card_game_contract_address).play_card(game_id + 1, actual_cards_after_buying_back_in.get(i)));
            env.advance_block_by(1);

            env.impersonate(winner);
            env.call_private_void(CardGame::at(card_game_contract_address).play_card(game_id + 1, actual_cards_after_winning_game.get(3 + i)));
            env.advance_block_by(1);
        }
    }


    let second_finished_game = env.call_unconstrained(card_game_contract_address, || { CardGame::view_game(game_id + 1) });
    assert(second_finished_game.finished);
}
