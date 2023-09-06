---
title: Aztec.nr Context
description: Documentation of Aztec's Private and Public execution contexts
hide_table_of_contents: false
---
# Overview of this page (change this title)

We want ot include some over arching details on what is included inside the context structure, and give an overview of what it actually is.

## What is the context.
The context is a variable that is made available within every function in `Aztec.nr`. As mentioned in the KERNEL CIRCUIT SECTION. The application context is a structure that contains all of the infromation a function needs from the kernel circuit, as well as all the information the kernel needs after a function execution completes. 

Behind the scenes, Aztec noir will pass data the kernel needs to and from a circuit, this is completely abstracted away from the developer. In an application developer's eyes; the context is a useful structure that allows access to anything on the aztec blockchain outside of the current circuit (REWORD THIS SECTION). 

## What is contained within the context.

The code snippet below shows what is currently contained within the private context.
#include_code private-context /yarn-project/noir-libs/noir-aztec/src/context.nr rust

### Private Context Broken Down
#### Inputs
The context inputs includes all of the information that is passed from the kernel circuit into the application circuit. It contains the following values.

#include_code private-context-inputs /yarn-project/noir-libs/noir-aztec/src/abi.nr rust

As shown in the snippet, the application context is made up of 4 main structures. The call context, the block data, the contract deployment data and the private global variables.

First of all, the call context.

#include_code call-context /yarn-project/noir-libs/noir-aztec/src/abi.nr rust

The call context contains information about the current call being made:.
1, Msg Sender
    - The message sender is the account (Aztec Contract) that sent the message to the current context. In the first call of the kernel circuit (often the account contract call), this value will be empty. For all subsequent calls the value will be the previous call. 

    ( TODO: INCLUDE A DIAGRAM HERE SHOWING HOW IT GETS UPDATED ON CONTRACT CALLS )
2. Storage contract address
    - This value is the address of the current context's contract address. This value will be the value of the current contract that is being executed except for when the current call is a delegate call (TODO: INCLUDE A LINK TO ITS DOCUMENTATION). In this case the value will be that of the sending contract. 

    - This value is important as it is the value that is used when siloing the storage values of a contract. ( TODO: DOES THIS NEED TO BE DIVED INTO MORE OR IS IT SOMETHING THTAT THERE IS A LINK TO).
3. Portal Contract Address 
    - This value stores the current contract's linked portal contract address. ( INCLUDE A LINK TO THE LITERATURE ). As a quick recap, this value is the value of the contracts related ethereum l1 contract address, and will be the recipient of any messages that are created by this contract.
4. Flags
    - Furthermore there are a series of flags that are stored within the application context:
        - is_delegate_call: Denotes whether the current call is a delegate call. If true, then the storage contract address will NOT be the current contract address.
        - is_static_call: (TODO: REFER TO EVM CODES TO FILL IN THIS SECTION)
        - is_contract_deployment: This will be set if and only if the current call is the contract's constructor.

### Historic Block Data
Another structure that is contained within the context is the Historic Block Data object. This object is a special one as it contains all of the roots of Aztec's data trees. 

#include_code historic-block-data /yarn-project/noir-libs/noir-aztec/src/abi.nr rust

## TODO: gloss this up
Having these tree's on hand allows for a host of interesting use cases. If you can create a merkle proof which matches the root of these trees. Then you can prove that a value exists in the current state of the system.

### Contract Deployment Data
Just like with the `is_contract_deployment` flag mentioned earlier. This flag will only be set to true when the current transaction is one in which a contract is being deployed.

#### TODO : WAT CONTAIN AND WAT DO


### Private Global Variables
TODO:
- include in this section how the global variabels can be accessed and what they contain




## Args Hash



    <!-- args_hash : Field,
    return_values : BoundedVec<Field, RETURN_VALUES_LENGTH>,

    read_requests: BoundedVec<Field, MAX_READ_REQUESTS_PER_CALL>,

    new_commitments: BoundedVec<Field, MAX_NEW_COMMITMENTS_PER_CALL>,
    new_nullifiers: BoundedVec<Field, MAX_NEW_NULLIFIERS_PER_CALL>,
    nullified_commitments: BoundedVec<Field, MAX_NEW_NULLIFIERS_PER_CALL>,

    private_call_stack : BoundedVec<Field, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    public_call_stack : BoundedVec<Field, MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL>,
    new_l2_to_l1_msgs : BoundedVec<Field, MAX_NEW_L2_TO_L1_MSGS_PER_CALL>, --> -->

## Public Context Inputs
In the current version of the system, the public context is almost a clone of the private execution context. It contains the same call context data, access to the same historic tree roots, however it does NOT have access to contract deployment data, this is due to traditional contract deployments only currently being possible from private transactions.

#include_code public-context-inputs /yarn-project/noir-libs/noir-aztec/src/abi.nr rust