A unit-tested file server (note, need aws auth to test s3 upload/download, and to use this tool in S3 mode for that matter) that acts like either a local or S3-backed cache.

Rationale:
- We need a unified cache tool that can support distributed caching. This is needed to replace our old docker image-based caching. It is easier to share S3 access and overall easier to use S3 tarballs rather than docker images.
- For local caching too, our current needs are not met. Earthly cache sometimes fails, and we want build artifacts outside of earthly usage or to put locally built artifacts where earthly can see them to speed up builds as it is our only flow currently for creating docker images. This plays nicely with the distributed cache.

Usage:
Run with ./start_server.sh. You can set S3_READ=true or S3_WRITE=true to turn on the distributed cache if your AWS credentials are set.
Note: It does not make much sense to do S3_READ=false if you set S3_WRITE=true, as you will write to cache unnecessarily.

Now once the server is running we can download files from the cache like so:
We put a list of .rebuild_patterns files (that have regex matching files in git) into the AZTEC_CACHE_REBUILD_PATTERNS env variable and a prefix for our artifact.
It does not need to be a unique name per build as our content hash will be appended.
- AZTEC_CACHE_REBUILD_PATTERNS=barretenberg/cpp/.rebuild_patterns ./cache-download.sh barretenberg

If we want to upload to the local or distributed cache (again depending if we started the server with S3_READ/S3_WRITE):
- AZTEC_CACHE_REBUILD_PATTERNS=barretenberg/cpp/.rebuild_patterns ./cache-download.sh barretenberg

If we want to write to our cache uing the local server we can do: