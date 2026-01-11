## ABOUT

- The project is a http request queue such as https://zeplo.io/ or Qstash from https://upstash.com/, but open source.

## TECHNOLOGIES

- Cloudflare workers
- Durable objects(Sqlite storage)
- Node.js
- Typescript

## LIMITATIONS ON FREE TIER

- Durable objects menory has limit 128MB.
- Cloudflare workers allow 1000 request per minute.
- Durable object allow 100.000 writes per day. PS: each message is 1 write to storage, 1 write update the index and 1 write to remove the register after process the message
