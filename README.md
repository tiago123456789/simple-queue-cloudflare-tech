## TODO

- (OK) To apply round robin to distribute the request and bypass the limitation 1000 request per minute each Cloudflare worker has.
- (OK) Resolve bug on retry feature.
- (IN PROGRESS) Make more scalable. PS: split the messages over different durable object ids. For example:
  - Id => 1
  - Id => 2
  - Id => 3
  - Id => 4
  - Id => 5
    id % 4
