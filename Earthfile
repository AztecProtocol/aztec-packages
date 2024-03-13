VERSION 0.8
FROM ubuntu:lunar

run-registry:
  # Run our own registry to alow for 
  LOCALLY
  IF ! docker ps | grep registry
    RUN docker run -d -p 5000:5000 --restart=always --name registry registry:2.7
  END
  SAVE IMAGE hello:latest

build-ci:
    BUILD ./avm-transpiler/+build
    BUILD ./barretenberg/cpp/+build-release
    BUILD ./barretenberg/cpp/+build-wasm
    BUILD ./barretenberg/cpp/+build-gcc
    BUILD ./barretenberg/cpp/+build-fuzzing
    BUILD ./barretenberg/cpp/+build-clang-assert
    BUILD ./barretenberg/cpp/+test-clang-format
    BUILD ./barretenberg/cpp/+test-clang-format
    BUILD ./boxes/+build
    BUILD ./noir/+build-packages
    BUILD ./noir/+build-nargo
    BUILD ./noir-projects/+build
    BUILD ./yarn-project/+build
    BUILD +test-end-to-end

build:
    # yarn-project has the entry point to Aztec
    BUILD ./yarn-project/+build

test-end-to-end:
    BUILD ./yarn-project/end-to-end/+test-all

bench:
  RUN echo hi

# Build system utilities
as-artifact:
    # Wrapper around an image that just exists to share files.
    ARG target
    FROM scratch
    WORKDIR /build
    COPY +$target/. .
    SAVE ARTIFACT ./

with-cache:
    # Wrapper around an image that can be used as the base of other images or 'docker run'
    # 
    # Implements a strategy for potentially looking for a build artifact, potentially from an image tag.
    # This allows for the following patterns:
    # - build a slow thing, have type default to 'image', which causes it to get pulled at the tag, sometimes do 'build-push' to update it
    # - build something that will be handed off to other runners, this can be a docker save + docker load priming another earthly runner
    # - build something that occassionally gets pushed to a registry
    ARG mode
    ARG target
    ARG tag=$target
    # Caching strategy: potentially read the image from 'tag', otherwise get from image
    IF [ "$mode" = "build" ] || [ "$mode" = "build-push" ] || [ "type" = "build-save" ]
        IF [ "$is_artifact" = "false" ]
          FROM +$target
        ELSE
          FROM +artifact --target=$target
        END
        IF [ "$mode" = "save" ]
            SAVE IMAGE aztecprotocol/cache:$tag
        ELSE IF [ "$mode" = "push" ]
            SAVE IMAGE --push aztecprotocol/cache:$tag
        END
    ELSE IF [ "$mode" = "from-cache" ]
        FROM aztecprotocol/cache:$tag
    ELSE
        RUN echo "Unexpected build mode: $mode" && exit 1
    END

with-minimal-cache:
    # Wrapper around an image that simply stores files for other images.
    # See with-cache for more details.
    # TODO in the future, allow for a mode that uses local files?
    ARG mode
    ARG target
    ARG tag=$target
    # Caching strategy: potentially read the image from 'tag', otherwise get from image
    IF [ "$mode" = "build" ] || [ "$mode" = "build-push" ] || [ "type" = "build-save" ]
        FROM +artifact --target=$target
        IF [ "$mode" = "save" ]
            SAVE IMAGE aztecprotocol/cache:$tag
        ELSE IF [ "$mode" = "push" ]
            SAVE IMAGE --push aztecprotocol/cache:$tag
        END
    ELSE IF [ "$mode" = "from-cache" ]
        FROM aztecprotocol/cache:$tag
    ELSE
        RUN echo "Unexpected build mode: $mode" && exit 1
    END
