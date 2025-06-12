# Arrays

Start with a side-effect array [T; M] from an app.

We don't validate that the LHS is non-empty,
to save constraints. We'll validate it in a later circuit.
(although it's only 600 constraints saved in the Kernel Inner)
                        |
                        |                    We validate that the RHS (length onwards) is empty,
                        |                    to ensure _all_ data from an app is captured.
                    ____|____    ___________ As a further optimisation, we could have the app
                   |  |  |  |   |  |  |  |   tell the kernel the lengths of its side-effect arrays.
                   v  v  v  v   v  v  v  v   An audited app would not lie about its lengths.
app:             [ a, b, c, d | 0, 0, 0, 0]
                   ^  ^  ^  ^ ^
                   |  |  |  | |____length - this is not a "dense, trimmed" length, since the LHS
   assert_equal----|  |  |  | |             might contain 0s, because we didn't check.
                   |  |  |  | |             It is just a "rhs empty" length.
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
                                                   |_    _________________Validate RHS empty
                                                  |  |  |  |  |  |  |  |
                                                  v  v  v  v  v  v  v  v
prev kernel: [ a, b, c, d| ?, ?, ?, ?]     app: [ e, f| 0, 0, 0, 0, 0, 0]
               ^  ^  ^  ^^                        ^  ^^
               |  |  |  ||___________             |  ||____"rhs empty" length
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




prev kernel: [ a, b, c, d, e, f| ?, ?]
               ^  ^  ^  ^  ^  ^
               |  |  |  |  |  |
               |  |  X  |  X  |  squash
               |  |   __|     |
               |  |  |   _____|
               |  |  |  |
               v  v  v  v
"kept" hint: [ a, b, d, f| ?, ?, ?, ?]

sorted:      [ b, f, a, d| ?, ?, ?, ?] (sorted by counter; not shown here)

(siloed & made unique - neither steps are shown here)

padded after the sorted length (in this example to length 7),

then RHS asserted to be 0

out hint:    [ a, b, d, f, p, p, p| 0]

