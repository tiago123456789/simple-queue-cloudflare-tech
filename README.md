## ABOUT

- The project is a queue implementation using Durable objects and Cloudflare workers where has focus improve my knowledge about the technologies and because I don't want to pay $5 dollars to Cloudflare only to test the queue feature.

## TECHNOLOGIES

- Cloudflare workers
- Durable objects
- Node.js
- Typescript

## LIMITATIONS ON FREE TIER

- Durable objects menory has limit 128MB.
- Cloudflare workers allow 1000 request per minute.
- Durable objects is single thread, so allow one operation per time, how to scale more
- How to improve the speed to publish the messages
- How to consume more than 1000 messages, even Cloudflare workers has limit of 1000 request per minute.
- How to make the Durable object get the messages and publish to consumers
- How to bypass the Durable object sqlite storage limit of 100000 writes per day.
