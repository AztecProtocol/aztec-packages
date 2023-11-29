FROM 278380418400.dkr.ecr.eu-west-2.amazonaws.com/yarn-project-prod AS yarn-project-prod

# Need new arch specific image.
FROM node:18-alpine
COPY --from=yarn-project-prod /usr/src /usr/src

# Setup cache volume.
ENV XDG_CACHE_HOME /cache
RUN mkdir /cache && chmod 777 /cache
VOLUME [ "/cache" ]

# Run as non-root user.
RUN corepack enable
RUN addgroup -S aztec && adduser -S aztec -G aztec
USER aztec

WORKDIR /usr/src/yarn-project/cli
ENTRYPOINT ["yarn", "start"]