# Simple Queue for Cloudflare 🚀

**A reliable, easy-to-use message queue system built on Cloudflare Workers. Open-source alternative to paid services like Zeplo or Qstash.**

Read in [Portuguese](README-pt.md)

## Why Choose Simple Queue? 🌟

Imagine sending messages between your apps without worrying about them getting lost or your systems crashing. Simple Queue makes it simple and affordable!

### Key Benefits:

- **Easy Setup**: Set it up once and forget about it. No complex server configurations needed.
- **Pay Only for What You Use**: Serverless technology means you only pay for actual usage – save money!
- **Reliable Delivery**: Messages are stored safely and delivered even if your apps are busy or offline.
- **Automatic Retries**: If something goes wrong, it tries again automatically.
- **Organize Your Messages**: Group messages by app or task to keep things tidy.
- **No Tech Experts Needed**: Works with simple HTTP requests – if you know APIs, you're good to go.
- **Cost-Effective**: No need for expensive DevOps teams or infrastructure.
- **Secure**: Protect your messages with API keys.

## How It Works 🔄

1. **Send Messages**: Your app sends messages via simple HTTP requests.
2. **Store Safely**: Messages are stored in a reliable queue.
3. **Process Automatically**: A scheduler picks up messages and sends them to your destination apps.
4. **Handle Errors**: If delivery fails, it retries or moves to a "dead letter" queue for review.

## Quick Start 🚀

1. **Clone the Project**: Download the code from GitHub.
2. **Install Dependencies**: Run `npm install`.
3. **Run Locally**: Use `npm run dev` to test on your machine.
4. **Deploy**: Run `npm run deploy` to put it live on Cloudflare.
5. **Set Up Scheduler**: Use Supabase to create a simple cron job that processes messages every few seconds.

For detailed setup, check the [full documentation](#how-to-run) below.

## Features ✨

- ✅ **Message Publishing**: Send messages to the queue easily.
- ✅ **Automatic Processing**: Handles delivery in the background.
- ✅ **Retry Mechanism**: Keeps trying if things don't work the first time.
- ✅ **Dead Letter Queue**: Failed messages go here for manual review.
- ✅ **Duplicate Prevention**: Avoids sending the same message twice.
- ✅ **Group Organization**: Separate messages by app or task.
- ✅ **Data Validation**: Ensures messages match expected formats.

## Architecture Overview 🏗️

![Architecture](./architecture.png)

## Performance & Costs 💰

- **Handles Thousands of Messages**: Tested with 3,000 requests in under 15 seconds.
- **Low Cost**: Processing 1 million messages costs around +/-$4.
- **Scalable**: Grows with your needs without extra setup.

## Get Help 🤝

Need assistance? We're here to help!

Email: [tiagorosadacost@gmail.com](mailto:tiagorosadacost@gmail.com)

---

## Technical Details (For Developers) 🔧

### Technologies Used

- Cloudflare Workers
- Durable Objects (SQLite storage)
- Node.js & TypeScript
- Supabase (for scheduling)

### Full Setup Instructions

- Clone the repository
- Run `npm install`
- Run `npm run dev` for local development
- Run `npm run deploy` to deploy to Cloudflare Workers
- Import the Insomnia collection `Insomnia_2026-01-11.yaml` for testing

### Setting Up Groups

Edit `groups.json` to add new groups (e.g., user_queue, product_queue).

### Data Validation

Use [this tool](https://transform.tools/json-to-zod) to generate validation schemas and add them to `src/schemas-validation.ts`.

### Scheduler Setup

Create a Supabase account and set up a cron job:

```sql
select net.http_get(
    url:='YOUR_QUEUE_URL/process',
    headers:=jsonb_build_object('x-api-key', 'YOUR_API_KEY'),
    timeout_milliseconds:=60000
);
```

### Environment Variables

- `API_KEY`: Protects your application
- `HTTP_REQUEST_TIMEOUT`: Request timeout in seconds
- `TOTAL_RETRIES_BEFORE_DQL`: Retry attempts before dead letter
- `TOTAL_MESSAGES_PULL_PER_TIME`: Messages processed per batch

### Limitations (Free Tier)

- 128MB memory limit
- 1,000 requests/minute
- 100,000 writes/day

### Load Test Results

Find scripts in `loadtest/` folder. Sample performance:

- 3k requests in 14.35s
- Average latency: 568ms
- Up to 1,188 req/sec
