---
title: Debugging
sidebar_position: 4
---

## Logging in Aztec.nr

On this section you can learn how to debug your Aztec.nr smart contracts and common errors that you may run into.

You can log statements from Aztec.nr contracts that will show ups in the Sandbox.

:::info

The Noir standard library `std::println` function will not work in Aztec contracts. You must use the `debug_log` and `debug_log_format` defined below.

:::

### Import `debug_log`

Import the `debug_log` dependency from Aztec oracles:

```rust
use dep::aztec::oracle::debug_log::{ debug_log };
```

### Write log

Write `debug_log()` in the appropriate place in your contract.

```rust
debug_log("here");
```

Other methods for logging include:

`debug_log_format()`: for logging Field values along arbitrary strings.

```rust
debug_log_format("get_2(slot:{0}) =>\n\t0:{1}\n\t1:{2}", [storage_slot, note0_hash, note1_hash]);
```

`debug_log_field()`: for logging Fields.

```rust
debug_log_field(my_field);
```

`debug_log_array()`: for logging array types.

```rust
debug_log_array(my_array);
```

### Start Sandbox in debug mode

Set `LOG_LEVEL` to `verbose` or `debug`:

```yml
# ~/.aztec/docker-compose.sandbox.yml

# ...

aztec:
  image: "aztecprotocol/aztec"
  ports:
    - "${PXE_PORT:-8080}:${PXE_PORT:-8080}"
  environment:
    LOG_LEVEL: verbose
  # ...
```

and start the sandbox normally.
