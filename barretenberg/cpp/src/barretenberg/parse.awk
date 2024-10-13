#!/usr/bin/awk -f

{
    # Regular expression to match bb::Univariate<bb::field<bb::Bn254FrParams>, n1ul, n2ul, n3ul>
    # and bb::Univariate<bb::field<bb::Bn254FqParams>, n1ul, n2ul, n3ul, n4ul>
    while (match($0, /bb::Univariate<bb::field<bb::Bn254F[qr]Params>, [0-9]+ul, [0-9]+ul, [0-9]+ul(, [0-9]+ul)?>/)) {
        # Print the matched string
        print substr($0, RSTART, RLENGTH)
        # Continue searching in the remaining part of the line
        $0 = substr($0, RSTART + RLENGTH)
    }
}
