## Noir Contracts Compilation Failures

A series of aztec-nr smart contracts used to test that a given contract fails to compile with the expected message.

Each of the contract packages needs to contain `expected_error` file with the expected error message.

The output then gets checked to contain this message when `bootstrap.sh test` command is executed.
