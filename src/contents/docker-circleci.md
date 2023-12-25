---
title: "Faster Docker Builds in CircleCI"
slug: docker-cci
datetime: 2023-07-15T16:13:06.242Z
draft: true
tags:
  - docker
  - ci
ogImage: ""
---

CircleCI has some interesting features to help you speed up Docker builds and all of them revolve around [Docker Layer Caching (DLC)](https://circleci.com/docs/docker-layer-caching/#overview). With DLC, CircleCI will be able to persist docker layers between CI runs, avoiding unnecessary re-builds.

## The File (tm)

Instead of going through the steps of writing a Dockerfile, I'll post a finalized-ish version for a Go program here and explain it:

```dockerfile
FROM golang:1.20-alpine3.18 AS builder

WORKDIR /app

RUN --mount=type=cache,target=/go/pkg/mod/ \
    --mount=type=bind,source=go.sum,target=go.sum \
    --mount=type=bind,source=go.mod,target=go.mod \
    go mod download -x


RUN --mount=type=cache,target=/go/pkg/mod/ \
    --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=bind,target=. \
    go build -o /build/server

FROM gcr.io/distroless/static

COPY --from=builder /build/server /server
ENTRYPOINT ["/server"]
```

1. Multi-stage builds to minimize the final image
   - The final image won't have any go mod dependencies that were downloaded in the previous step, and any other system dependencies
2. `--mount=type=bind` to mount files from the host system and avoid two `COPY` layers
3. `--mount=type=cache` to cache any files generated from the go build system
   - Go has great incremental build capabilities and caching the directories in this way will have a similar build experience as if you were building on your local machine, but in CI!
4. Use a very minimal final image such as `gcr.io/distroless/static` with necessary packages like `ca-certificates`
5. Copy the final binary from the builder image (and any other files you might need)

Obviously, the steps may be a bit different depending on the type of program you're building but the general idea applies: utilize `bind` and `cache` mounts to avoid `COPY` layers and persist build information.

If you're curious about these flags, check out [Docker's Containerize your Go Developer Environment Series](https://www.docker.com/blog/tag/go-env-series/) and [Docker Docs' Mounts Build Guide](https://docs.docker.com/build/guide/mounts/).

## Implementing

Using the Dockerfile behind a `docker build ...` with DLC enabled won't be enough to take advantage of multi-stage builds and the mounts. An example `.circleci/config.yml` excerpt:

```yaml
- setup_remote_docker:
    docker_layer_caching: true
- run: DOCKER_BUILDKIT=1 docker build -t image:latest .
```

CircleCI's DLC won't save the images built from the `builder` target as they're not tagged, so let's fix that by building that layer first and tag it.

```yaml
- setup_remote_docker:
    docker_layer_caching: true
- run: DOCKER_BUILDKIT=1 docker build -t image:base --target builder .
- run: DOCKER_BUILDKIT=1 docker build -t image:latest .
```

Now that we've tagged the `builder` target, DLC will pick up those layers and save them for the next CI run. The subsequent docker builds will also pick up on the base image.

We still aren't saving the cache from the `--mount=type=cache` as they're internal to the BuildKit engine and don't get picked up by DLC.

What does get saved in DLC are [buildx builder volumes](https://circleci.com/docs/docker-layer-caching/#buildx-builder-instances). We can spin up a `buildx` [Docker container driver](https://docs.docker.com/build/drivers/), where the cache from the mounts will be stored in the volume, which DLC will able to persist.

```yaml
- setup_remote_docker:
    docker_layer_caching: true
- run: docker buildx create \
    --name container \
    --driver=docker-container \
    --use --bootstrap
- run: docker buildx build \
    --load -t image:base \
    --target builder --builder container .
- run: docker buildx build \
    --load -t image:latest \
    --builder container .
```

First, we create a new BuildKit Docker container using `docker buildx create` and name it so that the volume has a consistent name. Next, we build our images like before using the `docker buildx build` command explicitly, pointing to the container and the `--load` flag so that the Docker images are sent to Docker on the host machine instead of staying in the BuildKit container.

With this method of building Docker images, you can reach pretty fast speeds in CircleCI with the ability to utilize DLC for even more steps of your CI such as testing.

## Considerations

We're storing quite a bit of cache with the layers and build information. It would be good practice to purge your DLC, in your CircleCI's project settings, in order to invalidate old dependencies and stay up-to-date on your base image.

You can also use a remote BuildKit instance to handle your caching, both the layers and the cache mounts should be cached in the remote instance and won't take up space in DLC.

[Depot](https://depot.dev/) provides this out of the box with their service and plug-n-play CLI, and additional features such as distributed caching if your team builds images locally. This might be a good option if your CI vendor doesn't provide a DLC feature and you aren't able to implement one yourself.

You can also cache Docker layers by using `buildx`'s [`--cache-from`](https://docs.docker.com/engine/reference/commandline/buildx_build/#cache-from) and [`--cache-to`](https://docs.docker.com/engine/reference/commandline/buildx_build/#cache-to) flags. I didn't pursue this as AWS ECR doesn't support this option with the current version of BuildKit. There has been [progress to support this feature.](https://github.com/aws/containers-roadmap/issues/876#issuecomment-1546760257)

There are other ways to utilize the power docker layer caching in your CI steps such as [Earthly](https://earthly.dev/) and [Dagger](https://dagger.io/), with Dagger being the more compelling option.

## Links

- "Distroless" Docker images: https://github.com/GoogleContainerTools/distroless
- `moby/buildkit` issue to change the `--mount=type=cache` location: https://github.com/moby/buildkit/issues/1512
- How Depot caches in the same issue: https://github.com/moby/buildkit/issues/1512#issuecomment-1618763074
