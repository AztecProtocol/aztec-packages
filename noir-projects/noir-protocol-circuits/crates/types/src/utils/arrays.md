# Arrays

Start with a side-effect array [T; M] from an app.

We don't validate that the LHS is non-empty,
to save constraints. We'll validate it in a later circuit.
(although it's only 600 constraints saved in the Kernel Inner)
                        |
                        |
                        |
                    ____|____    ___________ We don't validate that the RHS is empty,
                   |  |  |  |   |  |  |  |   we accept what the app tells us.
                   v  v  v  v   v  v  v  v
app:             [ a, b, c, d | ?, ?, ?, ?]
                   ^  ^  ^  ^ ^
                   |  |  |  | |____length - unvalidated until the tail, but propagated as though correct.
   assert_equal----|  |  |  | |
                   |  |  |  | |
                   v  v  v  v v
out hint:        [ a, b, c, d | ?, ?, ?, ?]
                                ^  ^  ^  ^
                                |__|__|__|__ We don't check that these are 0.
                                             The prover might have populated them with any data (through hints).
                                             We know the length is correct, so we can safely
                                             overwrite these in the next kernel iteration.


Assertions:
- `length` is equal in both arrays.
- The LHS values are equal (up to the length), noting that they could cheekily be 0s at this point.

The RHS values of the out array are not validated. The prover could have snuck anything in there. We'll catch them in a later circuit.



                                                LHS _any_ values
                                                (incl 0s)
                                                   |_    _________________ Not validated to be empty yet.
                                                  |  |  |  |  |  |  |  |
                                                  v  v  v  v  v  v  v  v
prev kernel: [ a, b, c, d| ?, ?, ?, ?]     app: [ e, f| ?, ?, ?, ?, ?, ?]
               ^  ^  ^  ^^                        ^  ^^
               |  |  |  ||___________             |  ||
               |  |  |  |   ________ |____________|  ||
               |  |  |  |  |   _____ | ______________||
               |  |  |  |  |  | _____|________________|
               |  |  |  |  |  ||     sum the lengths
               v  v  v  v  v  vv
out hint:    [ a, b, c, d, e, f| ?, ?]

Assertions:
- prev.length + app.length == out.length
- prev LHS values equal the out values, up to the prev.length.
- app LHS values equal the out values, between prev.length and out.length

The RHS values of the out array are not validated. The prover could have snuck anything in there. We'll catch them in a later circuit.


RESET CIRCUIT:

prev kernel: [ a, b, c, d, e, f| ?, ?]
               ^  ^  ^  ^  ^  ^
               |  |  |  |  |  |
               |  |  X  |  X  |  squash
               |  |   __|     |
               |  |  |   _____|
               |  |  |  |
               v  v  v  v
"kept" hint: [ a, b, d, f| ?, ?, ?, ?]

Before sorting, we need to ensure there are no rogue nonempty values on the RHS,
so that they don't get sneakily sorted into the LHS.

             [ a, b, d, f| 0, 0, 0, 0] <--- assert RHS zero


sorted:      [ b, f, a, d| 0, 0, 0, 0] (sorted by counter; not shown here)


(siloed & made unique - neither steps are shown here)

padded after the sorted length (in this example to length 7),

then RHS asserted to be 0

out hint:    [ a, b, d, f, p, p, p| 0]

