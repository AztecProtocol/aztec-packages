Scripts that implement a simple scheme to upload and download from S3 for use with caching. Supports .rebuild_patterns files inside the monorepo for detecting changes.
Assumes a git committed state. If that is not the case, you should not use the cache (as the Earthly usage does not).

Rationale:
- We need a unified cache tool that can support distributed caching. This is needed to replace our old docker image-based caching. It is easier to share S3 access and overall easier to use S3 tarballs rather than docker images.

See Earthfile and test.sh for usage.

Installation:
- This is just some shell scripts, but you do need AWS credentials set up and aws commandline installed otherwise the scripts **do nothing**.
