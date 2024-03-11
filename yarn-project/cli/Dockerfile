FROM aztecprotocol/yarn-project AS yarn-project
ENTRYPOINT ["node", "--no-warnings", "/usr/src/yarn-project/cli/dest/bin/index.js"]

RUN mkdir /cache && chmod 777 /cache
ENV XDG_CACHE_HOME /cache
VOLUME "/cache"
