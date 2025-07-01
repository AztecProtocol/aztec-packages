---
title: Shared State
---

This page covers an advanced type of state called shared state, which is public state that can also be read in private (and hence _shared_ by both domains). It is highly recommended that you're familiar with both [private](./private_state.md) and [public](./public_state.md) state before reading this page.

## Overview and Motivation

A typical example of shared state is some kind of system configuration, such as a protocol fee or access control permissions. These values are public (known by everyone) and mutable. Reading them in private however is tricky: private execution is always asynchronous and performed over _historical_ state, and hence one cannot easily prove that a given public value is current.

A naive way to solve this is to enqueue a public call that will assert the current public value, but this leaks _which_ public value is being read, severely reducing privacy. Even if the value itself is already public, the fact that we're using it because we're interacting with some related contract is not. For example, we may leak that we're interacting with a certain DeFi protocol by reading its fee.

An alternative approach is to create notes in public that are then nullified in private, but this introduces contention: only a single user may use the note and therefore read the state, since nullifying it will prevent all others from doing the same. In some schemes there's only one account that will read the state anyway, but this is not the general case.

Shared state works around this by introducing **delays**: while public values are mutable, they cannot change _immediately_. Instead, a value change must be scheduled ahead of time, and some minimum amount of time must pass between the scheduling and the new value taking effect. This means that we can privately prove that a historical public value cannot possibly change before some point in the future (due to the minimum delay), and therefore that our transaction will be valid **as long as it gets included before this future time**.

This results in the following key properties of shared state:

- shared values can only be changed after a certain delay has passed, never immediately
- the scheduling of value changes is itself public, including both the new value and the time at which the change will take effect
- transactions that read shared state become invalid after some time if not included in a block

## Privacy Considerations

While shared state variables are much less leaky than the assertion in public approach, they do reveal some information to external observers by setting the `include_by_timestamp` property of the transaction request. The impact of this can be mitigated with proper selection of the delay value and schedule times.

### Choosing Delays

The `include_by_timestamp` transaction property will be set to a value close to the current timestamp plus the duration of the delay in seconds. The exact value depends on the historical block over which the private proof is constructed. For example, if current timestamp is `X` and a shared state variable has a delay of 3000 seconds, then transactions that read this value privately will set `include_by_timestamp` to a value close to 'X  + 3000' (clients building proofs on older state will select a lower `include_by_timestamp`). This implicitly leaks the duration of the delay.

Applications using similar delays will therefore be part of the same privacy set. It is expected for social coordination to result in small set of predetermined delays that developers choose from depending on their needs, as an example a viable set might be: 12 hours (for time-sensitive operations, such as emergency mechanisms), 5 days (for middle-of-the-road operations) and 2 weeks (for operations that require lengthy public scrutiny). These delays can be changed during the contract lifetime as the application's needs evolve.

Additionally, users might choose to coordinate and constrain their transactions to set `include_by_timestamp` to a value lower than would be strictly needed by the applications they interact with (if any!) using some common delay, and by doing so prevent privacy leakage.

### Choosing Epochs

If a value change is scheduled in the near future, then transactions that access this shared state will be forced to set a lower `include_by_timestamp` right before the value change. For example, if the current timestamp is 'x' and a shared state variable with a delay of 3000 seconds has a value change scheduled for timestamp 'x + 50', then transactions that read this value privately will set `include_by_timestamp` to 'x + 50 - 1'. Since the timestamps at which shared state values change are public, it might be deduced that transactions with an `include_by_timestamp` value close to the current timestamp are reading some state variable with a changed scheduled at `include_by_timestamp + 1`.

Applications that schedule value changes at the same time will therefore be part of the same privacy set. It is expected for social coordination to result in ways to achieve this, e.g. by scheduling value changes so that they land on timestamps that are multiples of some value - we call these epochs.

There is a tradeoff between frequent and infrequent epochs: frequent epochs means more of them, and therefore fewer updates on each, shrinking the privacy set. But infrequent epochs result in the effective delay of value changes being potentially larger than desired - though an application can always choose to do an out-of-epoch update if needed.

Note that wallets can also warn users that a value change will soon take place and that sending a transaction at that time might result in reduced privacy, allowing them to choose to wait until after the epoch.

### Network Cooperation

Even though only transactions that interact with shared state _need_ to set the `include_by_timestamp` property, there is no reason why transactions that do not wouldn't also set this value. If indeed most applications converge on a small set of delays, then wallets could opt to select any of those to populate the `include_by_timestamp` field, as if they were interacting with a shared state variable with that delay.

This prevents the network-wide privacy set from being split between transactions that read shared state and those that don't, which is beneficial to everyone.

## `SharedMutable`

`SharedMutable` is a shared state variable for mutable state. It provides capabilities to read the same state both in private and public, and to schedule value changes after a delay. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/state_vars/shared_mutable/shared_mutable.nr).

Unlike other state variables, `SharedMutable` receives not only a type parameter for the underlying datatype, but also a `DELAY` type parameter with the value change delay as a number of seconds.

#include_code shared_mutable_storage /noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr rust

:::note
`SharedMutable` requires that the underlying type `T` implements both the `ToField` and `FromField` traits, meaning it must fit in a single `Field` value. There are plans to extend support by requiring instead an implementation of the `Serialize` and `Deserialize` traits, therefore allowing for multi-field variables, such as complex structs.
:::

Since `SharedMutable` lives in public storage, by default its contents are zeroed-out. Intialization is performed by calling `schedule_value_change`, resulting in initialization itself being delayed.

### `schedule_value_change`

This is the means by which a `SharedMutable` variable mutates its contents. It schedules a value change for the variable at a future timestamp after the `DELAY` has elapsed from the current timestamp, at which point the scheduled value becomes the current value automatically and without any further action, both in public and in private. If a pending value change was scheduled but not yet effective (because insufficient time had elapsed), then the previous schedule value change is replaced with the new one and eliminated. There can only be one pending value change at a time.

This function can only be called in public, typically after some access control check:

#include_code shared_mutable_schedule /noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr rust

If one wishes to schedule a value change from private, simply enqueue a public call to a public `internal` contract function. Recall that **all scheduled value changes, including the new value and scheduled timestamp are public**.

:::warning
A `SharedMutable`'s storage **must** only be mutated via `schedule_value_change`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.
:::

### `get_current_value`

Returns the current value in a public, private or utility execution context. Once a value change is scheduled via `schedule_value_change` and the delay time passes, this automatically returns the new value.

#include_code shared_mutable_get_current_public /noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr rust

Also, calling in private will set the `include_by_timestamp` property of the transaction request, introducing a new validity condition to the entire transaction: it cannot be included in any block with a timestamp larger than `include_by_timestamp`. This could [potentially leak some privacy](#privacy-considerations).

#include_code shared_mutable_get_current_private /noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr rust

### `get_scheduled_value`

Returns the last scheduled value change, along with the timestamp at which the scheduled value becomes the current value. This may either be a pending change, if the timestamp is in the future, or the last executed scheduled change if the timestamp is in the past (in which case there are no pending changes).

#include_code shared_mutable_get_scheduled_public /noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr rust

It is not possible to call this function in private: doing so would not be very useful at it cannot be asserted that a scheduled value change will not be immediately replaced if `shcedule_value_change` where to be called.
