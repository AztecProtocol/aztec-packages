FROM aztecprotocol/yarn-project
# Install chromium for browser tests.
RUN apt update && apt install -y chromium-browser
ENV CHROME_BIN="/usr/bin/chromium-browser"
WORKDIR /usr/src/yarn-project/end-to-end
ENTRYPOINT ["yarn", "test"]
