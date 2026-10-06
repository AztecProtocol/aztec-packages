# Build Image

To ensure a consistent environment for developers, and ease of getting started, we provide a development container.

## Visual Studio Code

If you use vscode, the simplest thing to do is install the "Dev Containers" plugin, and open the repo.
You'll be prompted to reload in a dev container, at which point you can open a terminal and bootstrap.
You can connect to your container from outside vscode with e.g.: `docker exec -ti <container_id> /bin/zsh`

Your repo will be mounted at `/workspaces/aztec-packages`, and your home directory is persisted in a docker volume.

## Running Independently

If you don't use vscode, you can simply run `./run.sh` to create and drop into the container.

Your repo will be mounted at `/workspaces/aztec-packages`, and your home directory is persisted in a docker volume.

## GitHub Codespaces

This is also compatible with GitHub codespaces. Visit the repo at `https://github.com/aztecprotocol/aztec-packages`.
Press `.`, and open a terminal window. You will be prompted to create a new machine.
You can then continue to work within the browser, or reopen the codespace in your local vscode.

## Building the build image

To build the images you'll need docker. To install follow this guide: https://docs.docker.com/engine/install.

To build the dev container on your local machine:

```
$ ./bootstrap.sh
```

This will take significant time and compute however, as it builds several toolchains from the ground up.

## Updating Dockerhub and AMI's

If the image needs to be changed, decide if the old image is still needed, in which case bump the version number.
Only do this if essential. To rebuild images and push to dockerhub and build ci amis run:

```
$ ./bootstrap.sh deploy
```

This will launch x86 and arm machines to build the images, and then push them to Dockerhub, then rebuild the AMI's.

- You will need `DOCKERHUB_PASSWORD` set in your environment.
- AMI id's will be updated in current working tree.
- Commit the result.

## Publishing via CI

The `Publish build images` workflow (`.github/workflows/publish-build-images.yml`) builds the images on GitHub-hosted
amd64 and arm64 runners and pushes them, plus the multi-arch manifests, to Docker Hub. It does not refresh the AMIs.
Bump `version` in `bootstrap.sh`, push the commit, then dispatch the workflow on `next` with that commit's full SHA:

```
$ gh workflow run publish-build-images.yml --repo AztecProtocol/aztec-packages --ref next -f ref=<full commit sha>
```

The tag is the `version` at that commit. The workflow refuses a tag that already exists on Docker Hub, since CI AMIs
cache images by tag; `-f allow_overwrite=true` overrides this. If only one architecture fails, use "Re-run failed
jobs" so the tag check does not reject the architecture that was already pushed.

## Sysbox

Internal aztec engineers use the mainframe.
If the version number changed a mainframe administrator to update the `/usr/local/bin/launch_sysbox` script.

Users will then need to perform a `sudo halt` to reboot with the new image.
