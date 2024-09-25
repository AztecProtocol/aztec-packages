A unit-tested file server (note, need aws auth to test s3 upload/download, and to use this tool in S3 mode for that matter) that acts like either a local or S3-backed cache.

Rationale:
- We need a unified cache tool that can support distributed caching. This is needed to replace our old docker image-based caching. It is easier to share S3 access and overall easier to use S3 tarballs rather than docker images.
- For local caching too, our current needs are not met. Earthly cache sometimes fails, and we want build artifacts outside of earthly usage or to put locally built artifacts where earthly can see them to speed up builds as it is our only flow currently for creating docker images. This plays nicely with the distributed cache.