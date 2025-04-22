// import { Signature } from "@aztec/foundation/eth-signature";
// import { EthAddress } from "@aztec/foundation/eth-address";
// import { CommitteeAttestation } from "@aztec/stdlib/block";
// import { orderAttestations } from "./utils.js";

// describe('orderAttestations', () => {

//   const makeCommittee = (size: number) => {
//     const committee = [];
//     for (let i = 0; i < size; i++) {
//       committee.push(EthAddress.random());
//     }
//     return committee;
//   }

//   it('should order attestations', () => {
//     const committee = makeCommittee(10);

//     const attestations = [new CommitteeAttestation(EthAddress.ZERO, Signature.empty())];
//     const orderedAttestations = orderAttestations(attestations, [EthAddress.ZERO]);
//   });
// });
