This is a prototype fuzzing harness for Aztec contract interactions. At the moment, it utilizes `aztec-up` toolset present in the system to create several default token contracts with ownership randomly assigned to one of the three `aztec-up` test accounts, and then performs mint/burn/transfer operations over them (both private and public), keeping track of the supposed resulting balances in a state machine. The balances are also checked randomly, with the harness stopping with an assertion if they don't match the tracked values.

Example usage:
```
cargo run --min-tokens=1 --max-tokens=4 
```
