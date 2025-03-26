| src/core/FeeJuicePortal.sol:FeeJuicePortal contract |                 |        |        |        |         |
|-----------------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                                     | Deployment Size |        |        |        |         |
| 589795                                              | 2886            |        |        |        |         |
| Function Name                                       | min             | avg    | median | max    | # calls |
| L2_TOKEN_ADDRESS                                    | 194             | 194    | 194    | 194    | 256     |
| UNDERLYING                                          | 270             | 270    | 270    | 270    | 3080    |
| canonicalRollup                                     | 1016            | 3632   | 5516   | 5516   | 5574    |
| depositToAztecPublic                                | 42812           | 127386 | 128025 | 128025 | 258     |
| distributeFees                                      | 27333           | 56798  | 57006  | 57006  | 258     |
| initialize                                          | 49029           | 49029  | 49029  | 49029  | 1566    |
| src/core/Rollup.sol:Rollup contract |                 |         |         |          |         |
|-------------------------------------|-----------------|---------|---------|----------|---------|
| Deployment Cost                     | Deployment Size |         |         |          |         |
| 7925568                             | 38750           |         |         |          |         |
| Function Name                       | min             | avg     | median  | max      | # calls |
| archive                             | 605             | 605     | 605     | 605      | 2475    |
| cheat__InitialiseValidatorSet       | 752109          | 7052330 | 752133  | 13524799 | 519     |
| claimProverRewards                  | 31794           | 53315   | 34239   | 93914    | 3       |
| claimSequencerRewards               | 57174           | 57174   | 57174   | 57174    | 1       |
| deposit                             | 169778          | 329145  | 342652  | 342652   | 256     |
| getAttesters                        | 1970            | 26343   | 26629   | 26629    | 259     |
| getBlock                            | 1230            | 1230    | 1230    | 1230     | 910     |
| getCollectiveProverRewardsForEpoch  | 636             | 1636    | 1636    | 2636     | 4       |
| getCurrentEpoch                     | 1017            | 1017    | 1017    | 1017     | 1032    |
| getCurrentEpochCommittee            | 42004           | 42004   | 42004   | 42004    | 1       |
| getCurrentProposer                  | 44246           | 117406  | 52217   | 263958   | 795     |
| getCurrentSlot                      | 823             | 1442    | 823     | 4823     | 142     |
| getEpochCommittee                   | 2010            | 14068   | 14218   | 14218    | 520     |
| getEpochDuration                    | 439             | 439     | 439     | 439      | 256     |
| getFeeAssetPerEth                   | 1440            | 1440    | 1440    | 1440     | 1       |
| getHasSubmitted                     | 942             | 1192    | 942     | 2942     | 8       |
| getInbox                            | 476             | 581     | 476     | 2476     | 4926    |
| getInfo                             | 1527            | 1527    | 1527    | 1527     | 16      |
| getManaBaseFeeAt                    | 7834            | 15737   | 16504   | 16514    | 2333    |
| getOutbox                           | 496             | 873     | 496     | 2496     | 5434    |
| getPendingBlockNumber               | 507             | 507     | 507     | 507      | 1546    |
| getProofSubmissionWindow            | 404             | 404     | 404     | 404      | 4       |
| getProvenBlockNumber                | 490             | 762     | 490     | 2490     | 7553    |
| getProvingCostPerManaInEth          | 429             | 429     | 429     | 429      | 1       |
| getProvingCostPerManaInFeeAsset     | 4164            | 4164    | 4164    | 4164     | 1       |
| getSequencerRewards                 | 671             | 1071    | 671     | 2671     | 5       |
| getSlasher                          | 496             | 496     | 496     | 496      | 518     |
| getSlotDuration                     | 421             | 421     | 421     | 421      | 256     |
| getSpecificProverRewardsForEpoch    | 822             | 2130    | 1634    | 3634     | 5       |
| getTargetCommitteeSize              | 462             | 462     | 462     | 462      | 768     |
| getTimestampForSlot                 | 887             | 888     | 887     | 4887     | 2462    |
| propose                             | 129177          | 362402  | 363530  | 572838   | 2601    |
| prune                               | 25731           | 36205   | 37466   | 41951    | 6       |
| setProvingCostPerMana               | 28691           | 28691   | 28691   | 28691    | 2       |
| setupEpoch                          | 208152          | 1372793 | 1400090 | 1400090  | 262     |
| submitEpochRootProof                | 64866           | 421805  | 420725  | 448480   | 909     |
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
| consume                                           | 28894           | 72144 | 73138  | 73400 | 4707    |
| getRootData                                       | 940             | 1343  | 1149   | 3217  | 2733    |
| hasMessageBeenConsumedAtBlockAndIndex             | 591             | 2583  | 2591   | 2591  | 259     |
| insert                                            | 22188           | 57527 | 68264  | 68264 | 1099    |
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
| executeProposal                                                 | 140075          | 140075 | 140075 | 140075 | 1       |
| vote                                                            | 64017           | 75384  | 64017  | 120852 | 10      |
| src/governance/CoinIssuer.sol:CoinIssuer contract |                 |       |        |       |         |
|---------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                   | Deployment Size |       |        |       |         |
| 326385                                            | 1465            |       |        |       |         |
| Function Name                                     | min             | avg   | median | max   | # calls |
| RATE                                              | 239             | 239   | 239    | 239   | 768     |
| mint                                              | 23901           | 43850 | 26637  | 81131 | 768     |
| mintAvailable                                     | 503             | 503   | 503    | 503   | 1283    |
| timeOfLastMint                                    | 360             | 360   | 360    | 360   | 256     |
| src/governance/Governance.sol:Governance contract |                 |        |        |        |         |
|---------------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                                   | Deployment Size |        |        |        |         |
| 2332350                                           | 10841           |        |        |        |         |
| Function Name                                     | min             | avg    | median | max    | # calls |
| deposit                                           | 27965           | 171786 | 186596 | 188519 | 9729    |
| dropProposal                                      | 23739           | 40533  | 33600  | 63600  | 2307    |
| execute                                           | 26209           | 71295  | 71327  | 161717 | 3076    |
| finaliseWithdraw                                  | 23757           | 45077  | 48283  | 65383  | 6057    |
| getConfiguration                                  | 1913            | 12163  | 19913  | 19913  | 5396    |
| getProposal                                       | 3523            | 8023   | 3523   | 31523  | 10590   |
| getProposalState                                  | 469             | 11470  | 13558  | 21242  | 23311   |
| getWithdrawal                                     | 1075            | 1075   | 1075   | 1075   | 10010   |
| governanceProposer                                | 424             | 1418   | 424    | 2424   | 515     |
| initiateWithdraw                                  | 30945           | 199027 | 211342 | 228958 | 7499    |
| powerAt                                           | 1042            | 1412   | 1042   | 3029   | 4608    |
| proposalCount                                     | 338             | 1714   | 2338   | 2338   | 1116    |
| propose                                           | 23763           | 321927 | 320487 | 337587 | 606     |
| proposeWithLock                                   | 26545           | 421003 | 422627 | 422627 | 257     |
| totalPowerAt                                      | 612             | 1569   | 883    | 3568   | 6067    |
| updateConfiguration                               | 23457           | 32910  | 24180  | 48186  | 6145    |
| updateGovernanceProposer                          | 21693           | 27184  | 28016  | 28028  | 2048    |
| vote                                              | 30670           | 87818  | 94478  | 94500  | 12289   |
| withdrawalCount                                   | 383             | 391    | 383    | 2383   | 2482    |
| src/governance/Registry.sol:Registry contract |                 |        |        |        |         |
|-----------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                               | Deployment Size |        |        |        |         |
| 500615                                        | 2063            |        |        |        |         |
| Function Name                                 | min             | avg    | median | max    | # calls |
| getCurrentSnapshot                            | 664             | 2664   | 2664   | 4664   | 514     |
| getGovernance                                 | 341             | 2159   | 2341   | 2341   | 2829    |
| getRollup                                     | 374             | 2358   | 2374   | 2374   | 869977  |
| getSnapshot                                   | 4740            | 4740   | 4740   | 4740   | 257     |
| getVersionFor                                 | 743             | 3527   | 2927   | 4927   | 773     |
| isRollupRegistered                            | 657             | 3805   | 2812   | 4812   | 515     |
| numberOfVersions                              | 350             | 1685   | 2350   | 2350   | 770     |
| transferOwnership                             | 28592           | 28592  | 28592  | 28592  | 106     |
| upgrade                                       | 23672           | 103312 | 106801 | 106801 | 6176    |
| src/governance/RewardDistributor.sol:RewardDistributor contract |                 |       |        |       |         |
|-----------------------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                                 | Deployment Size |       |        |       |         |
| 513664                                                          | 2360            |       |        |       |         |
| Function Name                                                   | min             | avg   | median | max   | # calls |
| BLOCK_REWARD                                                    | 238             | 238   | 238    | 238   | 376     |
| canonicalRollup                                                 | 1143            | 3143  | 3143   | 5643  | 904     |
| claim                                                           | 30122           | 45856 | 35665  | 64090 | 513     |
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
| executeProposal                                                            | 29491           | 43507 | 37213  | 366485 | 2053    |
| getExecutor                                                                | 3397            | 3397  | 3397   | 3397   | 256     |
| getInstance                                                                | 951             | 951   | 951    | 951    | 256     |
| rounds                                                                     | 865             | 865   | 865    | 865    | 522     |
| vote                                                                       | 29794           | 50139 | 50074  | 126085 | 855787  |
| yeaCount                                                                   | 851             | 851   | 851    | 851    | 16      |
| src/periphery/Forwarder.sol:Forwarder contract |                 |       |        |        |         |
|------------------------------------------------|-----------------|-------|--------|--------|---------|
| Deployment Cost                                | Deployment Size |       |        |        |         |
| 358690                                         | 1553            |       |        |        |         |
| Function Name                                  | min             | avg   | median | max    | # calls |
| forward                                        | 24936           | 27197 | 27012  | 132983 | 514     |
