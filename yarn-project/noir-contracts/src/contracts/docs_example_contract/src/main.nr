mod actions;
mod options;
mod storage;
mod types;

contract DocsExample {
    use dep::aztec::abi;
    use dep::aztec::abi::{PrivateCircuitPublicInputs, PrivateContextInputs, PublicContextInputs};
    use dep::aztec::constants_gen::MAX_READ_REQUESTS_PER_CALL;
    use dep::aztec::context::{
        PrivateContext,
        PublicContext,
    };

    use crate::actions;
    use crate::options::{create_account_card_getter_options, create_get_account_largest_card_options};
    // docs:start:storage-import
    use crate::storage::Storage;
    // docs:end:storage-import
    use crate::types::{
        card::Card,
        queen::Queen,
        rules::Rules,
    };

    global REPLACE_QUEEN_FUNCTION_SELECTOR = 11111111;
    global GET_POINTS_OF_COMMON_CARD_FUNCTION_SELECTOR = 11111111;

    fn constructor(
        inputs: PrivateContextInputs,
        min_points: u8,
        max_points: u8,
        legendary_card_secret: Field,
    ) -> distinct pub PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            min_points as Field,
            max_points as Field,
            legendary_card_secret,
        ]));
        
        let storage = Storage::init();

        let mut game_rules = Rules::new(min_points, max_points);
        actions::init_game_rules(&mut context, storage.game_rules, &mut game_rules);

        let mut legendary_card = Card::new(0, legendary_card_secret, 0);
        actions::init_legendary_card(&mut context, storage.legendary_card, &mut legendary_card);

        context.finish()
    }

    // docs:start:storage-init
    open fn lock(inputs: PublicContextInputs) -> pub abi::PublicCircuitPublicInputs {
        let context = PublicContext::new(inputs, 0);

        // highlight-next-line:storage-init
        let storage = Storage::init();
        storage.locked.write(true);

        context.finish()
    }
    // docs:end:storage-init

    // docs:start:functions-OpenFunction
    open fn unlock(inputs: PublicContextInputs) -> pub abi::PublicCircuitPublicInputs {
        let context = PublicContext::new(inputs, 0);

        let storage = Storage::init();
        actions::unlock(storage.locked);

        context.finish()
    }
    // docs:end:functions-OpenFunction

    open fn replace_queen(
        inputs: PublicContextInputs,
        account: Field,
        points: u8,
    ) -> pub abi::PublicCircuitPublicInputs {
        let context = PublicContext::new(inputs, abi::hash_args([account, points as Field]));
        let storage = Storage::init();

        let new_queen = Queen { account, points };
        
        assert(actions::can_replace_queen(storage.queen, new_queen));
        
        actions::replace_queen(storage.queen, new_queen);

        context.finish()
    }

    // docs:start:functions-SecretFunction
    fn add_common_cards(
        inputs: PrivateContextInputs,
        secrets: [Field; 4],
    ) -> distinct pub PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args(secrets));
        let storage = Storage::init();

        for i in 0..secrets.len() as u8 {
            let mut card = Card::new(0, secrets[i], 0);
            actions::add_new_card(&mut context, storage.cards, &mut card);
        }
        
        context.finish()
    }
    // docs:end:functions-SecretFunction

    fn update_legendary_card(
        inputs: PrivateContextInputs,
        new_points: u8,
        new_secret: Field,
    ) -> distinct pub PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([new_secret]));
        let storage = Storage::init();

        let owner = inputs.call_context.msg_sender;
        let mut updated_card = Card::new(new_points, new_secret, owner);

        assert(actions::is_valid_card(&mut context, storage.game_rules, updated_card));

        actions::update_legendary_card(&mut context, storage.legendary_card, &mut updated_card);

        context.finish()
    }

    fn become_queen(inputs: PrivateContextInputs) -> distinct pub PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, 0);
        let storage = Storage::init();

        let legendary_card = actions::get_legendary_card(&mut context, storage.legendary_card);

        let owner = legendary_card.owner;
        let result = context.call_private_function(
            inputs.call_context.storage_contract_address, 
            GET_POINTS_OF_COMMON_CARD_FUNCTION_SELECTOR,
            [owner, 0]
        );
        let total_points = legendary_card.points + result[0] as u8;

        context.call_public_function(
            inputs.call_context.storage_contract_address, 
            REPLACE_QUEEN_FUNCTION_SELECTOR,
            [owner, total_points as Field]
        );

        context.finish()
    }

    fn get_points_of_common_cards(
        inputs: PrivateContextInputs,
        account: Field,
        offset: u32,
    ) -> distinct pub PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([account, offset as Field]));
        let storage = Storage::init();

        let mut total_points = 0;
        let options = create_account_card_getter_options(account, offset);
        let cards = actions::get_cards(&mut context, storage.cards, options);
        for i in 0..MAX_READ_REQUESTS_PER_CALL {
            if (cards[i].is_some()) {
                let card = cards[i].unwrap_unchecked();
                assert(card.owner == account);
                total_points += card.points;
            }
        }

        context.return_values.push(total_points as Field);

        context.finish()
    }

    // docs:start:state_vars-check_return_notes
    fn discard_largest_card(
        inputs: PrivateContextInputs,
    ) -> distinct pub PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, 0);
        let storage = Storage::init();

        let account = context.msg_sender();
        let options = create_get_account_largest_card_options(account);
        let card = actions::get_cards(&mut context, storage.cards, options)[0].unwrap_unchecked();
        // highlight-next-line:state_vars-check_return_notes
        assert(card.owner == account);

        actions::remove_card(&mut context, storage.cards, card);

        context.finish()
    }
    // docs:end:state_vars-check_return_notes

    // docs:start:functions-UncontrainedFunction
    unconstrained fn get_total_points(account: Field) -> u8 {
        // 
        0
    }
    // docs:end:functions-UncontrainedFunction
}
