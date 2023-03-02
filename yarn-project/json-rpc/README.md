# json-rpc

json-rpc

```
-- src
    -- client
      Code to use by a client wishing to use a json-rpc server
      Includes syntax sugar for making requests with normal method syntax
    -- server
      Code for easily turning a class into an exposed RPC with one endpoint per method
```

Each JsonRpcClient and JsonRpcServer class needs a map of classes that will be translated in input and output values.
By default, Buffer is handled, but other usermade classes need to define toString() and static fromString() like so:

```
   class PublicKey {
     toString() {
       return '...';
     }
     static fromString(str) {
       return new PublicKey(...);
     }
   }
```

## Usage

In Dapp:

```
const wallet = new JsonRpcClient<WalletImplementation>('wallet-server.com', /*register classes*/ {PublicKey, TxRequest});
const response = await wallet.rpc.signTxRequest(accountPubKey, txRequest);
```

The client will send `[{ name: 'PublicKey', value: accountPubKey.toString() }, { name: 'TxRequest', txRequest.toString() }]` to the server.

In wallet:

```
const publicClient = new JsonRpcClient<PublicClient>('public-client.com',  /*register classes*/ ...);
const keyStore = new JsonRpcClient<KeyStore>('key-store.com',  /*register classes*/ ...);
```

Different clients for different services.

-- server
Running a wallet server:

```
const wallet = new WalletImplementation();
const server = new JsonRpcServer(wallet,  /*register classes*/ ...);
server.start(8080);
```
