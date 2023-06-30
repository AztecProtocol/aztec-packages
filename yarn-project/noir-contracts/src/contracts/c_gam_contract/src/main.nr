

// Noir implementation of a private token contract. It allows for the minting, and transfer of tokens. This contract
// only works with private state and for this reason user balances are stored as notes (total user balance is
// represented as a set of notes).
contract CGam {
    mod balance_utils;
    mod card;
    use dep::aztec3::abi;
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::abi::PublicContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::notes::value_note::Note;
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::map::Map;
    use dep::aztec3::state_vars::set::Set;

    // oracles
    use crate::oracle::get_secret_key::get_secret_key;
    use dep::aztec3::oracle::logs::emit_encrypted_log;
    use dep::aztec3::oracle::logs::emit_unencrypted_log;

    use crate::card::Card;

    //*********************************/
    // Mapping from card_id to CardNote state
    // secret cards: Map<Field, Set<CardNote>>;
    global cards: Map<PrivateState<CardNote>> = Map::new(1, |s| PrivateState<CardNote>::new(s));
    //*********************************/

    // PublicState name has been used instead of StorageField :(
    global game_id: PublicState<Field> = PublicState::new(2);

// struct GameState {

// }
// let game_state = game_states.at(game_id).read();
// game_states.at(game_id).write(game_state);

// StorageMap == Map<PublicState<Field>>
// Map == Map<Set<Note>>

    //number of players that joined the game
    global game_players = StorageMap { storage_slot: 2 };
    // get the nb of players:
    //game_players.at(game_id).read()
    // update the nb of players:
    //game_players.at(game_id).write(4);

    //number of players for the game
    global num_players = StorageMap { storage_slot: 3 };

    //average strengh of user deck
    global deck_strength = StorageMap { storage_slot: 4 };

    //users' deck
    global user_deck = StorageMap { storage_slot: 5 };

    //user plays: user_id -> 0 if not yet played, 1 if played
    global users_plays = StorageMap { storage_slot: 6 };

    //users order: 0 -> id of the first player, 1->id of the second, ...
    global player_order = StorageMap { storage_slot: 7 };

    fn buy_pack(
          //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        seed: Field,    //public randomness
        owner: Point,
        ) -> distinct pub abi::PrivateCircuitPublicInputs
    {
        // check user balance can afford the cards
        // TODO

        // create a note for the c-gam contract with the price of the pack
        // TODO

        // nullify the user notes
        // TODO

        // Generate the 'user seed' for generating the cards
        // from a public randomness (in argument for now, could be a call to a L1 contract)
        // and from user secret key (so nobody else can figure out user cards)
        let sk = get_secret_key(self.owner);
        let mut user_seed = [0; 32];
        let seeds = seed.to_le_bytes(32);
        let sk_bytes = sk.to_le_bytes(32);
        for i in 0..32 {
            user_seed[i] = seeds[i] ^ sk_bytes[i];
        }
        // generate randomness deterministically from 'public randomness' and user secret
        let random = std::hash::sha256(user_seed);
        let mut random_as_field = 0;
        let mut r = 1;
        //we generate 10 cards
        // let mut pack = [Card { id: 0, strength: 0, points: 0 }; 10];
        for i in 0..10 {
            random_as_field += random[2*i] * r;
            r = r*2;
            random_as_field += random[2*i+1] * r;
            r = r*2;
        }
        for i in 0..10 {
            let card_id = random_as_field * (i + 1);
            cards.at(card_id).insert(
                CardNote::new(
                    card: Card {
                        id: card_id,
                        strength : random[2*i],
                        points: random[2*i+1],
                    },
                    owner
                )
            );
        }
    }

    open fn create_game(
        //*********************************/
        // Should eventually be hidden:
        inputs: PublicContextInputs,
        //*********************************/
        num_players: Field)
    {
        // FEAT_REQUEST: game_id += 1; for a public state variable.
        let old_id = game_id.read();
        new_id = old_id += 1;
        game_id.write(new_id);
    }

    global max_players = 10;
    open fn start_game(game_id: Field) {
        // we compute the players play order
        let player_nb = num_players.at(game_id).read();

        // get the player strength
        let mut player_strengths = [0;max_players];
        for i in 0..max_players {
            let mut idx = (game_id + i) as Field;
            idx = idx*(idx+1)/2 + game_id;
            player_strengths[i] = deck_strength.at(idx).read();
        }
        // get the player order
        let sorted = player_strengths.sort();
        let players = [max_players + 1; max_players];
        for j in 0..max_players {
            if j < player_nb {
                for i in 0..max_players {
                    if player_strengths[i] == sorted[max_players-j] {
                        player_strengths[i] = 0;
                        if players[j] >= max_players {
                            players[j] = i;
                        }
                    }
                }
            }
        }
        //we store the user order
        for i in 0..max_players {
            if i < player_nb {
                let mut idx = (game_id + i) as Field;
                idx = idx*(idx+1)/2 + game_id;
                player_order.at(idx).write(players[i]);
            }
        }
    }

    fn join_game(
        inputs: PrivateContextInputs,
        game_id: Field,
        cards: [Card; 5]
        ) {
            // compute the deck strength
            let mut deck_strength : u32 = 0;
            for card in cards {
                deck_strength + = strength as u32;
            }
            deck_strength = deck_strength / 5;

            //checks that cards belong to the user

            // generate a user id
            let user_id = game_players.at(game_id).read();
            game_players.at(game_id).write(user_id + 1);


            // store the player strength
            let mut idx = (game_id + user_id) as Field;
            idx = idx*(idx+1)/2 + game_id;
            player_strengths[i] = deck_strength.at(idx).write(deck_strength as Field);
            // user has not yet played
            users_plays.at(idx).write(0);

            // maps the user_id to its cards
            for i in 0..5 {
                idx = (game_id + 5*user_id+i) as Field;
                idx = idx*(idx+1)/2 + game_id;
                user_deck.at(idx).write(cards[i].id);
            }

            if user_id == num_players.at(game_id).read() {
                start_game();
            }
        }

    open fn show_card(
        inputs: PrivateContextInputs,
        user_id: Field,
        game_id: Field,
        card: Card) {
            // checks that card belongs to the deck and it not already played

            // check user turn
            let mut check = true;
            for i in 0..max_players {
                let mut idx = (game_id + i) as Field;
                idx = idx*(idx+1)/2 + game_id;
                //all previous players must have played
                if i<user_id {
                    let player_i = player_order.at(idx).read();
                    let mut j = (game_id + player_i) as Field;
                     j = j*(j+1)/2 + game_id;
                    assert(users_plays.at(j).read() == 1);
                } else {
                    // user must not have played yet
                    if i == user_id {
                        assert(users_plays.at(idx).read() == 0);
                    }
                }
            }

            //...more stuff TODO...

            // user has played
            let mut idx = (game_id + user_id) as Field;
            idx = idx*(idx+1)/2 + game_id;
            player_order.at(idx).write(1);
            //
        }

    fn claim_winnings(
        inputs: PrivateContextInputs,
        game_id: Field) {
        }

    // // Mints `amount` of tokens to `owner`.
    // fn mint(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: PrivateContextInputs,
    //     //*********************************/
    //     amount: Field,
    //     owner: Point,
    // ) -> distinct pub abi::PrivateCircuitPublicInputs {
    //     let mut context = PrivateFunctionContext::new();
    //     context.args = context.args.push_array([amount, owner.x, owner.y]);

    //     let owner_balance = balances.at(owner.x);
    //     let note = Note::new(amount, owner);

    //     // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
    //     context = owner_balance.insert(context, note);
    //     assert(emit_encrypted_log(inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, note) == 0);
    //     assert(emit_unencrypted_log("Coins minted") == 0); // unencrypted log is emitted here only for testing purposes

    //     // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel..
    //     context.finish(inputs)
    // }

    // // Transfers `amount` of tokens from `sender` to a `recipient`.
    // fn transfer(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: PrivateContextInputs,
    //     //*********************************/
    //     amount: Field,
    //     sender: Point,
    //     recipient: Point,
    // ) -> distinct pub abi::PrivateCircuitPublicInputs {
    //     let mut initialContext = PrivateFunctionContext::new();
    //     initialContext.args = initialContext.args.push_array([amount, sender.x, sender.y, recipient.x, recipient.y]);

    //     // Gets the set of sender's notes and picks 2 of those.
    //     let sender_balance = balances.at(sender.x);
    //     let (mut context, (note1, note2)) = sender_balance.get_2(initialContext);

    //     // Ensure the notes are actually owned by the sender (to prevent user from generating a valid proof while
    //     // spending someone else's notes).
    //     note1.validate(sender);
    //     note2.validate(sender);

    //     // Checks that the sum of the notes is greater than or equal to the amount being transferred.
    //     let sum = note1.value + note2.value;
    //     assert(sum as u64 >= amount as u64);
    //     let change_value = sum - amount;

    //     // Removes the 2 notes from the sender's set of notes.
    //     context = sender_balance.remove(inputs, context, note1);
    //     context = sender_balance.remove(inputs, context, note2);

    //     // Creates 2 new notes, one for the recipient and one for the sender (change note).
    //     let change_note = Note::new(change_value, sender);
    //     let recipient_note = Note::new(amount, recipient);

    //     // Get the recipient's set of notes.
    //     let recipient_balance = balances.at(recipient.x);

    //     // Insert the 2 new notes to the recipient's and sender's sets of notes.
    //     context = recipient_balance.insert(context, recipient_note);
    //     context = sender_balance.insert(context, change_note);

    //     // Emit the newly created encrypted note preimages via oracle calls.
    //     assert(emit_encrypted_log(inputs.call_context.storage_contract_address, recipient_balance.storage_slot, recipient_note.owner, recipient_note) == 0);
    //     assert(emit_encrypted_log(inputs.call_context.storage_contract_address, sender_balance.storage_slot, change_note.owner, change_note) == 0);
    //     assert(emit_unencrypted_log("Coins transferred") == 0); // unencrypted log is emitted here only for testing purposes

    //     // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel..
    //     context.finish(inputs)
    // }

    // /// ABI getBalance type "unconstrained"
    // // Helper function to get the balance of a user ("unconstrained" is a Noir alternative of Solidity's "view" function).
    // fn getBalance(
    //     owner: Point,
    //     _padding: [Field; abi::MAX_ARGS - 2]
    // ) -> pub Field {
    //     // Get the set of notes owned by the user.
    //     let owner_balance = balances.at(owner.x);

    //     // Return the sum of all notes in the set.
    //     balance_utils::get_balance(owner_balance.storage_slot)
    // }
}
