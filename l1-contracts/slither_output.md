Summary
 - [unused-return](#unused-return) (1 results) (Medium)
 - [reentrancy-events](#reentrancy-events) (1 results) (Low)
 - [timestamp](#timestamp) (3 results) (Low)
 - [dead-code](#dead-code) (4 results) (Informational)
 - [solc-version](#solc-version) (1 results) (Informational)
 - [low-level-calls](#low-level-calls) (1 results) (Informational)
 - [similar-names](#similar-names) (1 results) (Informational)
 - [constable-states](#constable-states) (1 results) (Optimization)
## unused-return
Impact: Medium
Confidence: Medium
 - [ ] ID-0
[Rollup.process(bytes,bytes32,bytes32,bytes,bytes)](src/core/Rollup.sol#L54-L94) ignores return value by [(inHash,l1ToL2Msgs,l2ToL1Msgs) = MessagesDecoder.decode(_body)](src/core/Rollup.sol#L71-L72)

src/core/Rollup.sol#L54-L94


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-1
Reentrancy in [Rollup.process(bytes,bytes32,bytes32,bytes,bytes)](src/core/Rollup.sol#L54-L94):
	External calls:
	- [inbox.batchConsume(l1ToL2Msgs,msg.sender)](src/core/Rollup.sol#L88)
	- [outbox.sendL1Messages(l2ToL1Msgs)](src/core/Rollup.sol#L91)
	Event emitted after the call(s):
	- [L2BlockProcessed(header.globalVariables.blockNumber)](src/core/Rollup.sol#L93)

src/core/Rollup.sol#L54-L94


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-2
[Inbox.batchConsume(bytes32[],address)](src/core/messagebridge/Inbox.sol#L122-L143) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp > entry.deadline](src/core/messagebridge/Inbox.sol#L136)

src/core/messagebridge/Inbox.sol#L122-L143


 - [ ] ID-3
[Inbox.sendL2Message(DataStructures.L2Actor,uint32,bytes32,bytes32)](src/core/messagebridge/Inbox.sol#L45-L91) uses timestamp for comparisons
	Dangerous comparisons:
	- [_deadline <= block.timestamp](src/core/messagebridge/Inbox.sol#L54)

src/core/messagebridge/Inbox.sol#L45-L91


 - [ ] ID-4
[Inbox.cancelL2Message(DataStructures.L1ToL2Msg,address)](src/core/messagebridge/Inbox.sol#L102-L113) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= _message.deadline](src/core/messagebridge/Inbox.sol#L108)

src/core/messagebridge/Inbox.sol#L102-L113


## dead-code
Impact: Informational
Confidence: Medium
 - [ ] ID-5
[Inbox._errIncompatibleEntryArguments(bytes32,uint64,uint64,uint32,uint32,uint32,uint32)](src/core/messagebridge/Inbox.sol#L212-L230) is never used and should be removed

src/core/messagebridge/Inbox.sol#L212-L230


 - [ ] ID-6
[Outbox._errNothingToConsume(bytes32)](src/core/messagebridge/Outbox.sol#L115-L117) is never used and should be removed

src/core/messagebridge/Outbox.sol#L115-L117


 - [ ] ID-7
[Inbox._errNothingToConsume(bytes32)](src/core/messagebridge/Inbox.sol#L197-L199) is never used and should be removed

src/core/messagebridge/Inbox.sol#L197-L199


 - [ ] ID-8
[Outbox._errIncompatibleEntryArguments(bytes32,uint64,uint64,uint32,uint32,uint32,uint32)](src/core/messagebridge/Outbox.sol#L130-L148) is never used and should be removed

src/core/messagebridge/Outbox.sol#L130-L148


## solc-version
Impact: Informational
Confidence: High
 - [ ] ID-9
solc-0.8.21 is not recommended for deployment

## low-level-calls
Impact: Informational
Confidence: High
 - [ ] ID-10
Low level call in [Inbox.withdrawFees()](src/core/messagebridge/Inbox.sol#L148-L153):
	- [(success) = msg.sender.call{value: balance}()](src/core/messagebridge/Inbox.sol#L151)

src/core/messagebridge/Inbox.sol#L148-L153


## similar-names
Impact: Informational
Confidence: Medium
 - [ ] ID-11
Variable [Rollup.AVAILABILITY_ORACLE](src/core/Rollup.sol#L30) is too similar to [Rollup.constructor(IRegistry,IAvailabilityOracle)._availabilityOracle](src/core/Rollup.sol#L39)

src/core/Rollup.sol#L30


## constable-states
Impact: Optimization
Confidence: High
 - [ ] ID-12
[Rollup.lastWarpedBlockTs](src/core/Rollup.sol#L37) should be constant 

src/core/Rollup.sol#L37


