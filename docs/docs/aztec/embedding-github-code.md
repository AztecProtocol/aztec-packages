---
title: Embedding Github Code
---

Here's an example of embedding code from a file of a branch of a github repo:

import GitHubCode from '../..//src/components/GithubCode';


<GitHubCode owner="AztecProtocol" repo="aztec-packages" branch="master" filePath="yarn-project/noir-contracts/src/contracts/zk_token_contract/src/main.nr" startLine={2} endLine={30000} />

<GitHubCode owner="AztecProtocol" repo="aztec-packages" branch="master" filePath="README.md" startLine={2} endLine={20} />

<GitHubCode owner="AztecProtocol" repo="aztec-packages" branch="master" filePath="README.md"/>