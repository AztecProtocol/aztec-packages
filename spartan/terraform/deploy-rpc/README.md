# RPC Deployment

Terraform for standalone public RPC deployments.

Shared modules:

- `modules/environment`: this module defines an environment. Creates RPC and API Gateway
- `modules/rpc`: Aztec RPC deployment
- `../modules/rpc-gateway`: Kong API Gateway

Environments. This is what you want to `terraform apply`
- `environments/testnet`: testnet RPC
- `environments/mainnet`: mainnet RPC following canonical & v4

Set the Aztec images in each environment with `V4_AZTEC_DOCKER_IMAGE` and `CANONICAL_AZTEC_DOCKER_IMAGE`. The canonical RPC block is currently commented out, but it already references the canonical image variable for when that route is enabled. Each RPC entry passes its image directly to the node module.

GitHub Actions can deploy these environments through `.github/workflows/deploy-rpc.yml`. Call it with `rpc_environment` set to `testnet` or `mainnet`, and `v4_aztec_docker_image` set to the image to deploy.

RPC node environment is configured through each RPC entry's single `env` map. Common values such as `NETWORK`, `L1_CHAIN_ID`, and `RPC_MAX_BODY_SIZE` live in the environment-level `local.env`; rollup-specific values such as `ROLLUP_VERSION` are merged per RPC.

API key consumers are Terraform inputs, but API key values are not. For each `CONSUMERS` entry, provide `gcp_secret_manager_secret_name`. Set `ALLOW_ANONYMOUS = true` on the environment module to allow anonymous usage, with `ANONYMOUS_RATE_LIMIT_MINUTE` controlling rate limit.

RPC gateway routes accept `https://host/<api-key>` in addition to the configured API key header. Kong copies the first path segment into the auth header before `key-auth` runs, then strips that segment before proxying to the upstream service.

Kong answers browser CORS preflights for gateway routes with wildcard origins and allows the configured API key header.
