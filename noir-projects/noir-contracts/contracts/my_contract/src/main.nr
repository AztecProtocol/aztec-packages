contract MyContract {
    use dep::token::{types::{token_note::TokenNote, balances_map::BalancesMap}};

    #[aztec(storage)]
    struct Storage {
        balances: BalancesMap<TokenNote>,
    }
}
