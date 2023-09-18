---
title: Updating
---

There are 4 components whose versions need to be kept compatible:
1. Aztec Sandbox,
2. Aztec CLI,
3. Noir compiler `nargo`,
4. Noir framework for Aztec contracts `aztec.nr`.

## Updating Aztec Sandbox
To update the sandbox to the latest version, simply run the curl command we used for installation again:
```shell
/bin/bash -c "$(curl -fsSL 'https://sandbox.aztec.network')"
```

It will download and start the latest version of sandbox.

If you would like to use a fixed version of the sandbox, you can export the `SANDBOX_VERSION` environmental variable.
If you are unsure what version to use go to [aztec-packages repository](https://github.com/AztecProtocol/aztec-packages/releases) and choose the `aztec-packages` release based on the changelog.

Then set the `SANDBOX_VERSION` environmental variable to the version you want to use. E.g.:
```shell
export SANDBOX_VERSION=v0.7.5
```

Now when you run the curl command it will use the version you specified.
To verify that it's the case check the console output of the curl command.
You should see the following line:
```
Aztec Sandbox v0.7.5 is now ready for use!
```

Alternatively you can open a new terminal and use aztec-cli to get the version.

#include_code node-info yarn-project/end-to-end/src/cli_docs_sandbox.test.ts bash

The client version should be the same as the one we chose by setting the `SANDBOX_VERSION` environmental variable.

## Updating Aztec CLI
If the latest version was used when updating the sandbox then we can simply run the following command to update the CLI:
```shell
npm install -g @aztec/cli
```

If a specific version was set for the sandbox then we need to install the CLI with the same version:
```shell
npm install -g @aztec/cli@REPLACE_WITH_SANDBOX_VERSION
```

E.g.:
```shell
npm install -g @aztec/cli@0.7.5
```

## Updating Noir compiler
Now we need to update the Noir compiler `nargo` to the version compatible with the sandbox.
Use `aztec-cli` to get it:
#include_code node-info yarn-project/end-to-end/src/cli_docs_sandbox.test.ts bash

Then we install the `Compatible Nargo Version` with (replace `COMPATIBLE_NARGO_VERSION` with the version from the previous command):
```shell
noirup -v COMPATIBLE_NARGO_VERSION
```

## Updating Noir framework
Finally we need to update the Noir framework for Aztec contracts `aztec.nr`.
We need to install a version compatible with our `nargo` version.