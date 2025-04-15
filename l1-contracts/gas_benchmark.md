| src/core/Rollup.sol:Rollup contract |                 |          |          |          |         |
|-------------------------------------|-----------------|----------|----------|----------|---------|
| Deployment Cost                     | Deployment Size |          |          |          |         |
| 8905012                             | 44009           |          |          |          |         |
| Function Name                       | min             | avg      | median   | max      | # calls |
| cheat__InitialiseValidatorSet       | 14773538        | 14773538 | 14773538 | 14773538 | 1       |
| getBlock                            | 1252            | 1252     | 1252     | 1252     | 12      |
| getBurnAddress                      | 280             | 280      | 280      | 280      | 1       |
| getCurrentEpoch                     | 870             | 870      | 870      | 870      | 490     |
| getCurrentProposer                  | 137000          | 164906   | 137000   | 1532365  | 200     |
| getCurrentSlot                      | 625             | 629      | 625      | 2625     | 490     |
| getEpochCommittee                   | 138682          | 138682   | 138682   | 138682   | 100     |
| getEpochForBlock                    | 1087            | 1087     | 1087     | 1087     | 196     |
| getFeeAssetPortal                   | 541             | 541      | 541      | 541      | 1       |
| getFeeHeader                        | 1479            | 1479     | 1479     | 1479     | 95      |
| getManaBaseFeeAt                    | 15466           | 20025    | 20350    | 24662    | 195     |
| getPendingBlockNumber               | 398             | 402      | 398      | 2398     | 494     |
| getProvenBlockNumber                | 512             | 512      | 512      | 512      | 3       |
| getTimestampForSlot                 | 824             | 824      | 824      | 824      | 195     |
| getVersion                          | 404             | 424      | 404      | 2404     | 100     |
| setProvingCostPerMana               | 25937           | 25964    | 25937    | 28737    | 101     |
| submitEpochRootProof                | 783299          | 796011   | 783311   | 821423   | 3       |
| src/core/messagebridge/Inbox.sol:Inbox contract |                 |     |        |     |         |
|-------------------------------------------------|-----------------|-----|--------|-----|---------|
| Deployment Cost                                 | Deployment Size |     |        |     |         |
| 0                                               | 0               |     |        |     |         |
| Function Name                                   | min             | avg | median | max | # calls |
| getFeeAssetPortal                               | 234             | 234 | 234    | 234 | 1       |
| src/periphery/Forwarder.sol:Forwarder contract |                 |        |        |        |         |
|------------------------------------------------|-----------------|--------|--------|--------|---------|
| Deployment Cost                                | Deployment Size |        |        |        |         |
| 358690                                         | 1553            |        |        |        |         |
| Function Name                                  | min             | avg    | median | max    | # calls |
| forward                                        | 624506          | 630841 | 629469 | 640840 | 100     |
