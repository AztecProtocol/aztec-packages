# The correct action to take in case of a missing installation is to update the build images.
# However, they will not be updated automatically going forward.
# If unable to ping Charlie or Adam to update the AMIs that have the build image (along with the build images themselves)
# this is a reasonable temporary measure.
set -eu
apt update
# for docs:
apt install libvips-dev
