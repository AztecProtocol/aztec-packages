| src/core/FeeJuicePortal.sol:FeeJuicePortal contract |                 |        |        |        |         |
|-----------------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                                     | Deployment Size |        |        |        |         |
| 589795                                              | 2886            |        |        |        |         |
| Function Name                                       | min             | avg    | median | max    | # calls |
| L2_TOKEN_ADDRESS                                    | 194             | 194    | 194    | 194    | 256     |
| UNDERLYING                                          | 270             | 270    | 270    | 270    | 3061    |
| canonicalRollup                                     | 1016            | 3628   | 5516   | 5516   | 5562    |
| depositToAztecPublic                                | 42745           | 127319 | 127958 | 127958 | 258     |
| distributeFees                                      | 27333           | 56798  | 57006  | 57006  | 258     |
| initialize                                          | 48963           | 48963  | 48963  | 48963  | 1566    |
| src/core/Rollup.sol:Rollup contract |                 |         |         |          |         |
|-------------------------------------|-----------------|---------|---------|----------|---------|
| Deployment Cost                     | Deployment Size |         |         |          |         |
| 7934021                             | 38603           |         |         |          |         |
| Function Name                       | min             | avg     | median  | max      | # calls |
| archive                             | 605             | 605     | 605     | 605      | 2474    |
| cheat__InitialiseValidatorSet       | 751841          | 7048889 | 751865  | 13518099 | 519     |
| claimProverRewards                  | 31816           | 53337   | 34261   | 93936    | 3       |
| claimSequencerRewards               | 57196           | 57196   | 57196   | 57196    | 1       |
| deposit                             | 169711          | 328403  | 342585  | 342585   | 256     |
| getAttesters                        | 1970            | 26343   | 26629   | 26629    | 259     |
| getBlock                            | 1230            | 1230    | 1230    | 1230     | 898     |
| getCollectiveProverRewardsForEpoch  | 636             | 1636    | 1636    | 2636     | 4       |
| getCurrentEpoch                     | 908             | 908     | 908     | 908      | 1032    |
| getCurrentEpochCommittee            | 42026           | 42026   | 42026   | 42026    | 1       |
| getCurrentProposer                  | 44246           | 117396  | 52217   | 263958   | 795     |
| getCurrentSlot                      | 713             | 1332    | 713     | 4713     | 142     |
| getEpochCommittee                   | 2010            | 14068   | 14218   | 14218    | 520     |
| getEpochDuration                    | 439             | 439     | 439     | 439      | 256     |
| getFeeAssetPerEth                   | 1462            | 1462    | 1462    | 1462     | 1       |
| getHasSubmitted                     | 942             | 1192    | 942     | 2942     | 8       |
| getInbox                            | 476             | 581     | 476     | 2476     | 4926    |
| getInfo                             | 1527            | 1527    | 1527    | 1527     | 16      |
| getManaBaseFeeAt                    | 7834            | 15737   | 16504   | 16514    | 2333    |
| getOutbox                           | 518             | 895     | 518     | 2518     | 5434    |
| getPendingBlockNumber               | 507             | 507     | 507     | 507      | 1546    |
| getProofSubmissionWindow            | 404             | 404     | 404     | 404      | 4       |
| getProvenBlockNumber                | 512             | 784     | 512     | 2512     | 7551    |
| getProvingCostPerManaInEth          | 429             | 429     | 429     | 429      | 1       |
| getProvingCostPerManaInFeeAsset     | 4164            | 4164    | 4164    | 4164     | 1       |
| getSequencerRewards                 | 671             | 1071    | 671     | 2671     | 5       |
| getSlasher                          | 518             | 518     | 518     | 518      | 518     |
| getSlotDuration                     | 443             | 443     | 443     | 443      | 256     |
| getSpecificProverRewardsForEpoch    | 822             | 2130    | 1634    | 3634     | 5       |
| getTargetCommitteeSize              | 462             | 462     | 462     | 462      | 768     |
| getTimestampForSlot                 | 909             | 910     | 909     | 4909     | 2462    |
| propose                             | 129177          | 362294  | 363530  | 572838   | 2601    |
| prune                               | 25642           | 36116   | 37377   | 41862    | 6       |
| setProvingCostPerMana               | 28713           | 28713   | 28713   | 28713    | 2       |
| setupEpoch                          | 208063          | 1372704 | 1400001 | 1400001  | 262     |
| submitEpochRootProof                | 64866           | 421707  | 420659  | 448414   | 897     |
| src/core/messagebridge/Inbox.sol:Inbox contract |                 |       |        |       |         |
|-------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                 | Deployment Size |       |        |       |         |
| 0                                               | 0               |       |        |       |         |
| Function Name                                   | min             | avg   | median | max   | # calls |
| getRoot                                         | 802             | 802   | 802    | 802   | 2       |
| inProgress                                      | 304             | 304   | 304    | 304   | 3       |
| sendL2Message                                   | 44403           | 54747 | 47796  | 95703 | 41504   |
| totalMessagesInserted                           | 284             | 284   | 284    | 284   | 512     |
| src/core/messagebridge/Outbox.sol:Outbox contract |                 |       |        |       |         |
|---------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                   | Deployment Size |       |        |       |         |
| 586673                                            | 2646            |       |        |       |         |
| Function Name                                     | min             | avg   | median | max   | # calls |
| consume                                           | 28894           | 71980 | 73128  | 73400 | 4328    |
| getRootData                                       | 940             | 1363  | 1171   | 3217  | 2732    |
| hasMessageBeenConsumedAtBlockAndIndex             | 591             | 2583  | 2591   | 2591  | 259     |
| insert                                            | 22188           | 57508 | 68264  | 68264 | 1097    |
| src/core/staking/Slasher.sol:Slasher contract |                 |        |        |        |         |
|-----------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                               | Deployment Size |        |        |        |         |
| 0                                             | 0               |        |        |        |         |
| Function Name                                 | min             | avg    | median | max    | # calls |
| PROPOSER                                      | 182             | 182    | 182    | 182    | 2       |
| slash                                         | 125484          | 125484 | 125484 | 125484 | 1       |
| src/core/staking/SlashingProposer.sol:SlashingProposer contract |                 |        |        |        |         |
|-----------------------------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                                                 | Deployment Size |        |        |        |         |
| 0                                                               | 0               |        |        |        |         |
| Function Name                                                   | min             | avg    | median | max    | # calls |
| executeProposal                                                 | 139987          | 139987 | 139987 | 139987 | 1       |
| vote                                                            | 63907           | 75274  | 63907  | 120742 | 10      |
| src/governance/CoinIssuer.sol:CoinIssuer contract |                 |       |        |       |         |
|---------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                   | Deployment Size |       |        |       |         |
| 326541                                            | 1465            |       |        |       |         |
| Function Name                                     | min             | avg   | median | max   | # calls |
| RATE                                              | 239             | 239   | 239    | 239   | 768     |
| mint                                              | 23901           | 43841 | 26637  | 81105 | 768     |
| mintAvailable                                     | 503             | 503   | 503    | 503   | 1283    |
| timeOfLastMint                                    | 360             | 360   | 360    | 360   | 256     |
| src/governance/Governance.sol:Governance contract |                 |        |        |        |         |
|---------------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                                   | Deployment Size |        |        |        |         |
| 2332350                                           | 10841           |        |        |        |         |
| Function Name                                     | min             | avg    | median | max    | # calls |
| deposit                                           | 27898           | 171720 | 186529 | 188452 | 9729    |
| dropProposal                                      | 23739           | 40533  | 33600  | 63600  | 2307    |
| execute                                           | 26209           | 71290  | 71327  | 161717 | 3076    |
| finaliseWithdraw                                  | 23757           | 45117  | 48283  | 65383  | 6065    |
| getConfiguration                                  | 1913            | 12163  | 19913  | 19913  | 5396    |
| getProposal                                       | 3523            | 8023   | 3523   | 31523  | 10590   |
| getProposalState                                  | 469             | 11470  | 13558  | 21242  | 23311   |
| getWithdrawal                                     | 1075            | 1075   | 1075   | 1075   | 10095   |
| governanceProposer                                | 424             | 1418   | 424    | 2424   | 515     |
| initiateWithdraw                                  | 30945           | 199151 | 211342 | 228958 | 7546    |
| powerAt                                           | 1042            | 1412   | 1042   | 3029   | 4608    |
| proposalCount                                     | 338             | 1714   | 2338   | 2338   | 1116    |
| propose                                           | 23763           | 321926 | 320487 | 337587 | 606     |
| proposeWithLock                                   | 26545           | 421002 | 422627 | 422627 | 257     |
| totalPowerAt                                      | 612             | 1567   | 883    | 3568   | 6081    |
| updateConfiguration                               | 23457           | 32909  | 24180  | 48186  | 6145    |
| updateGovernanceProposer                          | 21705           | 27184  | 28016  | 28028  | 2048    |
| vote                                              | 30670           | 87818  | 94478  | 94500  | 12289   |
| withdrawalCount                                   | 383             | 391    | 383    | 2383   | 2496    |
| src/governance/Registry.sol:Registry contract |                 |        |        |        |         |
|-----------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                               | Deployment Size |        |        |        |         |
| 500615                                        | 2063            |        |        |        |         |
| Function Name                                 | min             | avg    | median | max    | # calls |
| getCurrentSnapshot                            | 664             | 2664   | 2664   | 4664   | 514     |
| getGovernance                                 | 341             | 2159   | 2341   | 2341   | 2829    |
| getRollup                                     | 374             | 2358   | 2374   | 2374   | 874329  |
| getSnapshot                                   | 4740            | 4740   | 4740   | 4740   | 257     |
| getVersionFor                                 | 743             | 3527   | 2927   | 4927   | 773     |
| isRollupRegistered                            | 657             | 3805   | 2812   | 4812   | 515     |
| numberOfVersions                              | 350             | 1685   | 2350   | 2350   | 770     |
| transferOwnership                             | 28592           | 28592  | 28592  | 28592  | 106     |
| upgrade                                       | 23672           | 103302 | 106801 | 106801 | 6157    |
| src/governance/RewardDistributor.sol:RewardDistributor contract |                 |       |        |       |         |
|-----------------------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                                 | Deployment Size |       |        |       |         |
| 513664                                                          | 2360            |       |        |       |         |
| Function Name                                                   | min             | avg   | median | max   | # calls |
| BLOCK_REWARD                                                    | 238             | 238   | 238    | 238   | 379     |
| canonicalRollup                                                 | 1143            | 3143  | 3143   | 5643  | 892     |
| claim                                                           | 30122           | 45852 | 35599  | 64024 | 513     |
| owner                                                           | 2384            | 2384  | 2384   | 2384  | 257     |
| registry                                                        | 347             | 1347  | 1347   | 2347  | 2       |
| updateRegistry                                                  | 23757           | 23781 | 23757  | 30119 | 257     |
| src/governance/proposer/GovernanceProposer.sol:GovernanceProposer contract |                 |       |        |        |         |
|----------------------------------------------------------------------------|-----------------|-------|--------|--------|---------|
| Deployment Cost                                                            | Deployment Size |       |        |        |         |
| 639733                                                                     | 3152            |       |        |        |         |
| Function Name                                                              | min             | avg   | median | max    | # calls |
| LIFETIME_IN_ROUNDS                                                         | 216             | 216   | 216    | 216    | 512     |
| M                                                                          | 261             | 261   | 261    | 261    | 4868    |
| N                                                                          | 260             | 260   | 260    | 260    | 1949    |
| REGISTRY                                                                   | 205             | 205   | 205    | 205    | 256     |
| computeRound                                                               | 435             | 435   | 435    | 435    | 266     |
| executeProposal                                                            | 29491           | 43507 | 37213  | 366375 | 2053    |
| getExecutor                                                                | 3397            | 3397  | 3397   | 3397   | 256     |
| getInstance                                                                | 951             | 951   | 951    | 951    | 256     |
| rounds                                                                     | 865             | 865   | 865    | 865    | 522     |
| vote                                                                       | 29794           | 50139 | 50074  | 125975 | 860187  |
| yeaCount                                                                   | 851             | 851   | 851    | 851    | 16      |
| src/periphery/Forwarder.sol:Forwarder contract |                 |       |        |        |         |
|------------------------------------------------|-----------------|-------|--------|--------|---------|
| Deployment Cost                                | Deployment Size |       |        |        |         |
| 358690                                         | 1553            |       |        |        |         |
| Function Name                                  | min             | avg   | median | max    | # calls |
| forward                                        | 24936           | 27197 | 27012  | 132931 | 514     |
