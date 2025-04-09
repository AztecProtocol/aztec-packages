| src/core/FeeJuicePortal.sol:FeeJuicePortal contract |                 |       |        |        |         |
|-----------------------------------------------------|-----------------|-------|--------|--------|---------|
| Deployment Cost                                     | Deployment Size |       |        |        |         |
| 0                                                   | 0               |       |        |        |         |
| Function Name                                       | min             | avg   | median | max    | # calls |
| L2_TOKEN_ADDRESS                                    | 239             | 239   | 239    | 239    | 1       |
| depositToAztecPublic                                | 28903           | 59187 | 34503  | 114156 | 3       |
| distributeFees                                      | 22005           | 33846 | 27856  | 51678  | 3       |
| initialize                                          | 48985           | 48985 | 48985  | 48985  | 1566    |
| src/core/Rollup.sol:Rollup contract |                 |         |         |          |         |
|-------------------------------------|-----------------|---------|---------|----------|---------|
| Deployment Cost                     | Deployment Size |         |         |          |         |
| 8451525                             | 41441           |         |         |          |         |
| Function Name                       | min             | avg     | median  | max      | # calls |
| archive                             | 605             | 605     | 605     | 605      | 2474    |
| cheat__InitialiseValidatorSet       | 752181          | 4982899 | 752205  | 13526635 | 776     |
| claimProverRewards                  | 31800           | 53321   | 34245   | 93920    | 3       |
| claimSequencerRewards               | 57180           | 57180   | 57180   | 57180    | 1       |
| deposit                             | 169796          | 326462  | 342670  | 342670   | 256     |
| getAttesters                        | 1971            | 14228   | 1971    | 26630    | 515     |
| getBlock                            | 1230            | 1230    | 1230    | 1230     | 883     |
| getBurnAddress                      | 369             | 369     | 369     | 369      | 1       |
| getCollectiveProverRewardsForEpoch  | 636             | 1636    | 1636    | 2636     | 4       |
| getCurrentEpoch                     | 1017            | 1017    | 1017    | 1017     | 1941    |
| getCurrentEpochCommittee            | 42004           | 42004   | 42004   | 42004    | 1       |
| getCurrentProposer                  | 44246           | 122673  | 52218   | 263958   | 995     |
| getCurrentSlot                      | 823             | 993     | 823     | 4823     | 539     |
| getEpochCommittee                   | 35560           | 91622   | 135780  | 259358   | 1130    |
| getEpochDuration                    | 439             | 439     | 439     | 439      | 512     |
| getEpochForBlock                    | 1016            | 1016    | 1016    | 1016     | 196     |
| getFeeAssetPerEth                   | 1440            | 1440    | 1440    | 1440     | 1       |
| getFeeAssetPortal                   | 519             | 519     | 519     | 519      | 1567    |
| getFeeHeader                        | 1457            | 1457    | 1457    | 1457     | 95      |
| getHasSubmitted                     | 943             | 1193    | 943     | 2943     | 8       |
| getInbox                            | 476             | 477     | 476     | 2476     | 7004    |
| getInfo                             | 1533            | 1533    | 1533    | 1533     | 16      |
| getManaBaseFeeAt                    | 6161            | 14959   | 14831   | 26831    | 2791    |
| getOutbox                           | 496             | 498     | 496     | 2496     | 4670    |
| getPendingBlockNumber               | 507             | 508     | 507     | 2507     | 1947    |
| getProofSubmissionWindow            | 404             | 404     | 404     | 404      | 4       |
| getProvenBlockNumber                | 490             | 762     | 490     | 2490     | 7554    |
| getProvingCostPerManaInEth          | 429             | 429     | 429     | 429      | 1       |
| getProvingCostPerManaInFeeAsset     | 4164            | 4164    | 4164    | 4164     | 1       |
| getSequencerRewards                 | 677             | 1077    | 677     | 2677     | 5       |
| getSlasher                          | 496             | 496     | 496     | 496      | 774     |
| getSlotDuration                     | 421             | 421     | 421     | 421      | 512     |
| getSpecificProverRewardsForEpoch    | 823             | 2131    | 1635    | 3635     | 5       |
| getTargetCommitteeSize              | 462             | 462     | 462     | 462      | 1024    |
| getTimestampForSlot                 | 887             | 888     | 887     | 4887     | 2657    |
| getVersion                          | 493             | 1023    | 493     | 2493     | 7900    |
| propose                             | 139414          | 354778  | 352912  | 601007   | 2601    |
| prune                               | 25731           | 36205   | 37466   | 41951    | 6       |
| setProvingCostPerMana               | 25915           | 25996   | 25915   | 28715    | 103     |
| setupEpoch                          | 208152          | 1372793 | 1400090 | 1400090  | 262     |
| submitEpochRootProof                | 64859           | 420435  | 418029  | 817054   | 873     |
| src/core/messagebridge/Inbox.sol:Inbox contract |                 |       |        |       |         |
|-------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                 | Deployment Size |       |        |       |         |
| 0                                               | 0               |       |        |       |         |
| Function Name                                   | min             | avg   | median | max   | # calls |
| getRoot                                         | 754             | 2158  | 2754   | 2754  | 2596    |
| inProgress                                      | 282             | 282   | 282    | 282   | 3       |
| sendL2Message                                   | 44484           | 54828 | 47877  | 95784 | 41504   |
| totalMessagesInserted                           | 284             | 1284  | 1284   | 2284  | 2       |
| src/core/messagebridge/Outbox.sol:Outbox contract |                 |       |        |       |         |
|---------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                   | Deployment Size |       |        |       |         |
| 618184                                            | 2855            |       |        |       |         |
| Function Name                                     | min             | avg   | median | max   | # calls |
| consume                                           | 28894           | 72054 | 73183  | 73445 | 4109    |
| getRootData                                       | 940             | 1343  | 1149   | 3217  | 2732    |
| hasMessageBeenConsumedAtBlockAndIndex             | 591             | 2583  | 2591   | 2591  | 259     |
| insert                                            | 22188           | 57505 | 68252  | 68264 | 1097    |
| src/core/staking/Slasher.sol:Slasher contract |                 |        |        |        |         |
|-----------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                               | Deployment Size |        |        |        |         |
| 0                                             | 0               |        |        |        |         |
| Function Name                                 | min             | avg    | median | max    | # calls |
| PROPOSER                                      | 182             | 182    | 182    | 182    | 2       |
| slash                                         | 124034          | 124034 | 124034 | 124034 | 1       |
| src/core/staking/SlashingProposer.sol:SlashingProposer contract |                 |        |        |        |         |
|-----------------------------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                                                 | Deployment Size |        |        |        |         |
| 0                                                               | 0               |        |        |        |         |
| Function Name                                                   | min             | avg    | median | max    | # calls |
| executeProposal                                                 | 138625          | 138625 | 138625 | 138625 | 1       |
| vote                                                            | 64017           | 75384  | 64017  | 120852 | 10      |
| src/governance/CoinIssuer.sol:CoinIssuer contract |                 |       |        |       |         |
|---------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                   | Deployment Size |       |        |       |         |
| 326553                                            | 1465            |       |        |       |         |
| Function Name                                     | min             | avg   | median | max   | # calls |
| RATE                                              | 239             | 239   | 239    | 239   | 768     |
| mint                                              | 23901           | 43849 | 26631  | 81131 | 768     |
| mintAvailable                                     | 503             | 503   | 503    | 503   | 1283    |
| timeOfLastMint                                    | 360             | 360   | 360    | 360   | 256     |
| src/governance/Governance.sol:Governance contract |                 |        |        |        |         |
|---------------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                                   | Deployment Size |        |        |        |         |
| 2332350                                           | 10841           |        |        |        |         |
| Function Name                                     | min             | avg    | median | max    | # calls |
| deposit                                           | 27965           | 171780 | 186596 | 188519 | 9731    |
| dropProposal                                      | 23739           | 40533  | 33600  | 63600  | 2307    |
| execute                                           | 26209           | 70527  | 71327  | 152243 | 3077    |
| finaliseWithdraw                                  | 23757           | 45261  | 48283  | 65383  | 6017    |
| getConfiguration                                  | 1913            | 12165  | 19913  | 19913  | 5397    |
| getProposal                                       | 3523            | 8020   | 3523   | 31523  | 10595   |
| getProposalState                                  | 469             | 11468  | 13558  | 21242  | 23315   |
| getWithdrawal                                     | 1075            | 1075   | 1075   | 1075   | 10166   |
| governanceProposer                                | 424             | 1418   | 424    | 2424   | 515     |
| initiateWithdraw                                  | 30945           | 199174 | 211342 | 228958 | 7573    |
| powerAt                                           | 1042            | 1412   | 1042   | 3029   | 4608    |
| proposalCount                                     | 338             | 1709   | 2338   | 2338   | 1121    |
| propose                                           | 23763           | 321944 | 320487 | 337587 | 610     |
| proposeWithLock                                   | 26545           | 421011 | 422627 | 422627 | 258     |
| totalPowerAt                                      | 612             | 1566   | 883    | 3568   | 6093    |
| updateConfiguration                               | 23457           | 32910  | 24180  | 48186  | 6145    |
| updateGovernanceProposer                          | 21705           | 27183  | 28016  | 28028  | 2048    |
| vote                                              | 30670           | 87818  | 94478  | 94500  | 12290   |
| withdrawalCount                                   | 383             | 391    | 383    | 2383   | 2508    |
| src/governance/Registry.sol:Registry contract |                 |       |        |       |         |
|-----------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                               | Deployment Size |       |        |       |         |
| 845410                                        | 4070            |       |        |       |         |
| Function Name                                 | min             | avg   | median | max   | # calls |
| addRollup                                     | 23721           | 90722 | 95470  | 97461 | 4152    |
| getCanonicalRollup                            | 1016            | 6998  | 7016   | 7016  | 865883  |
| getGovernance                                 | 309             | 2142  | 2309   | 2309  | 3086    |
| getRewardDistributor                          | 267             | 267   | 267    | 267   | 2347    |
| getRollup                                     | 592             | 592   | 592    | 592   | 1       |
| numberOfVersions                              | 325             | 325   | 325    | 325   | 2       |
| transferOwnership                             | 28665           | 28665 | 28665  | 28665 | 107     |
| updateGovernance                              | 47218           | 47218 | 47218  | 47218 | 19      |
| src/governance/RewardDistributor.sol:RewardDistributor contract |                 |       |        |       |         |
|-----------------------------------------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                                                 | Deployment Size |       |        |       |         |
| 475915                                                          | 2290            |       |        |       |         |
| Function Name                                                   | min             | avg   | median | max   | # calls |
| BLOCK_REWARD                                                    | 238             | 238   | 238    | 238   | 381     |
| canonicalRollup                                                 | 10158           | 10158 | 10158  | 10158 | 863     |
| claim                                                           | 33152           | 49042 | 38911  | 67336 | 513     |
| src/governance/proposer/GovernanceProposer.sol:GovernanceProposer contract |                 |       |        |        |         |
|----------------------------------------------------------------------------|-----------------|-------|--------|--------|---------|
| Deployment Cost                                                            | Deployment Size |       |        |        |         |
| 639721                                                                     | 3152            |       |        |        |         |
| Function Name                                                              | min             | avg   | median | max    | # calls |
| LIFETIME_IN_ROUNDS                                                         | 216             | 216   | 216    | 216    | 512     |
| M                                                                          | 261             | 261   | 261    | 261    | 4868    |
| N                                                                          | 260             | 260   | 260    | 260    | 1949    |
| REGISTRY                                                                   | 205             | 205   | 205    | 205    | 256     |
| computeRound                                                               | 435             | 435   | 435    | 435    | 266     |
| executeProposal                                                            | 34133           | 48109 | 41822  | 371095 | 2053    |
| getExecutor                                                                | 3397            | 3397  | 3397   | 3397   | 256     |
| getInstance                                                                | 951             | 951   | 951    | 951    | 256     |
| rounds                                                                     | 865             | 865   | 865    | 865    | 522     |
| vote                                                                       | 34436           | 54804 | 54739  | 130727 | 859435  |
| yeaCount                                                                   | 851             | 851   | 851    | 851    | 16      |
| src/periphery/Forwarder.sol:Forwarder contract |                 |        |        |         |         |
|------------------------------------------------|-----------------|--------|--------|---------|---------|
| Deployment Cost                                | Deployment Size |        |        |         |         |
| 358690                                         | 1553            |        |        |         |         |
| Function Name                                  | min             | avg    | median | max     | # calls |
| forward                                        | 24936           | 133124 | 28924  | 1908717 | 614     |
