FROM sigp/lighthouse:v6.0.1

COPY ./eth-beacon.sh ./eth-beacon.sh

ENTRYPOINT ["/eth-beacon.sh"]
