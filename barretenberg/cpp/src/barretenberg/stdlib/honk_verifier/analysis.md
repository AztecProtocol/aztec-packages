Instantiate accuulator as witnesses: 4731 (overhead of iniitalizing range lists is about 1821 gates)
Instantiate vk as witnesses:         7641 (+ )
prepare for folding(): // accumulator
    receive up to first hash :       8169
    generate 3 etas          :       10178
    receive three commitments:       10224
    generate beta, gamma     :       10733
    receive more commitments :       10832
    compute PI delta         :       10853
    receive z_perm commitment:       10886
    generate 39 alphas       :       14306
(                   total on oink verifier: 14306 - 7641 = 6665)
prepare for folding(): // instance
     ...                             20977
(                   total on oink verifier: 20977 - 14306 = 6665)
...
evaluate perturbator:                21175
...
up to beginnnning of folding:        21529
...
fold commitments:
    fold verification key (30 msms): 23288 (+ 1759)
    fold witnesses        (24 msms): 24680 (+ 1392)
(58 gates per mul * 54 muls)
TOTAL BEFORE FINALIZATION: 24815
TOTAL AFTER  FINALIZATION: 29673

Rough breakdown of non field/group costs pre-finalization:
  - Constructing stdlib accumulator and vk
     constant overhead of 1821
     2910 to construct stdlib accumulator via from_witness
     2910 to construct stdlib incoming vk via from_witness
     TOTAL 7621
     TARGET reduce 97 per from_witness to 19
            2961 = 1821 + 2 * (19/97) * 2910
            (saves 4660 gates pre-finalization)
            (measure: ~6300 gates post-finalization)
  - Oink verifier (2x)
     706  to receive from transcript via operator=
     2009 to hash 72 field elements to generate eta_1/2/3
          first call : have to spend ~80 * 70 / 3 = 1866 gates
     509  to hash 13 field elements to generate beta, gamma
     3420 to hash 58 = 20 + 38 field elements to generate alpha_1/.../39
     TOTAL: 13288 = 2 * 6644
     TOTOAL HASHING:  11876 = 13288 - 2 * 706
     TARGET: generating two challenges per hash:
             2 * (~(1866 + 80) for etas,
                   ~430 for beta/gamma,
                   ~480 +  80 * 38/2 = )
             2 * (4376)
             = 8752
             (saves 3152 gates)

So by
    - cutting out on_curve checks from from_witness
    - generating two hashes at once
It seems like we could save 4660 + 3152 = 7612 from pre-finalization to get down to 17203 pre-finalization.
    -? Not running oink the second time... save 4376? So 2 * 17203 - 4376 = 30030k, amoritized < 2^14.

Cutting out the cost of from_witness complete (assuming no need to instantiate range tables anymore),
it seems like we could save an additional 2961 gates pre-finalization to get down to 14242 pre-finalization.

If receiving commitments in the Oink verifier were likewise free,
it seems like we could save an additional 1412 gates pre-finalization to get down to 12830 pre-finalization.


Questions:
 - Cost of operator= to recieve in Oink?
 - Don't need to oink verify twice on second fold;
 - Accumulator doesn't need to be reinstantiated