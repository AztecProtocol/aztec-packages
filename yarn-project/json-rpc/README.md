# json-rpc

json-rpc
-- src
-- client
In Dapp:

```
const wallet = new JsonRpcClient('wallet-server.com');
wallet.signTxRequest(accountPubKey, txRequest);
The client will send [{ name: 'PublicKey', value: accountPubKey.toString() }, { name: 'TxRequest', txRequest.toString() }] to the server.
```

In wallet:

```
const publicClient = new JsonRpcClient('public-client.com');
const keyStore = new JsonRpcClient('key-store.com');
Different clients for different services.
```

-- server
Running a wallet server:

```
const wallet = new WalletImplementation();
const server = new JsonRpcServer(wallet);
server.start(8080);
```
