import { Context, Hono } from 'hono';
import handler from './handler.js';
import MessageSliper from './queue/message-spliter.js';
import { Env, Queue } from './queue/queue.js';
import { cors } from 'hono/cors';

const hashMap = new MessageSliper(2);

const app = new Hono();

export { Queue };

app.use('*', cors());

app.use('*', async (c, next) => {
	const apiKey = c.req.header('x-api-key');

	if (apiKey !== (c.env as Env).API_KEY) {
		return c.json(
			{
				message: 'Unauthorized: Missing or invalid API key',
			},
			401
		);
	}

	await next();
});

function getQueueInstane(c: Context, id?: string) {
	const env = c.env as Env;
	let queueId;
	if (!id) {
		queueId = env.QUEUE.idFromName('QUEUE_DO');
	} else {
		queueId = env.QUEUE.idFromName(hashMap.getId(id));
	}
	const queueStub = env.QUEUE.get(queueId) as DurableObjectStub<Queue>;
	return queueStub;
}

app.get('/health', async (c) => {
	const mapDOIds: { [key: number]: string } = hashMap.getMapsDOIds();
	const keys = Object.keys(mapDOIds);
	for (let index = 0; index < keys.length; index += 1) {
		// @ts-ignore
		const key: number = keys[index];
		const DOId = mapDOIds[key];
		const env = c.env as Env;
		const queueId = env.QUEUE.idFromName(DOId);
		const queueStub = env.QUEUE.get(queueId) as DurableObjectStub<Queue>;
		if (queueStub === null) {
			return c.json({ message: 'Durable Object not found' }, 500);
		}

		await queueStub.setupAlarm();
	}

	return c.text('OK');
});

app.get('/get-messages', async (c) => {
	const queueStub = getQueueInstane(c);
	if (queueStub === null) {
		return c.json({ message: 'Durable Object not found' }, 500);
	}
	const results = await queueStub.getAll();
	return c.json({ results, ok: true });
});

app.get('/get-messages-dlq', async (c) => {
	const queueStub = getQueueInstane(c);
	if (queueStub === null) {
		return c.json({ message: 'Durable Object not found' }, 500);
	}
	const results = await queueStub.getAll();
	return c.json({ results, ok: true });
});

app.post('/publish', async (c) => {
	const id = crypto.randomUUID();
	const queueStub = getQueueInstane(c, id);
	const body = await c.req.json();

	if (queueStub === null) {
		return c.json({ message: 'Durable Object not found' }, 500);
	}
	await queueStub.addToQueue(id, body.payload);
	return c.json({ ok: true });
});

app.post('/publish-batch', async (c) => {
	const queueStub = getQueueInstane(c);
	const body = await c.req.json();

	if (queueStub === null) {
		return c.json({ message: 'Durable Object not found' }, 500);
	}

	const items = body.map((item: { [key: string]: any }) => {
		item.id = crypto.randomUUID();
		return item;
	});
	await queueStub.addBatch(items, true);
	return c.json({ ok: true });
});

app.post('/consume', async (c) => {
	const body = await c.req.json();

	if (!body.id || !body.payload) {
		return c.json({ message: 'Message needs id and payload keys' }, 400);
	}

	let queueStub = getQueueInstane(c, body.id);
	const isPublishedInBatch = body.payload.isPublishedInBatch;
	if (isPublishedInBatch) {
		queueStub = getQueueInstane(c);
	}

	if (queueStub === null) {
		return c.json({ message: 'Durable Object not found' }, 500);
	}

	console.log(`Consuming the message with id ${body.id}`);
	try {
		await handler(body.payload);
		await queueStub.delete(body.id);
		console.log(`Consumed the message with id ${body.id}`);
	} catch (error) {
		console.error(error);
		await queueStub.incrementRetries(body.id);
		console.log(`Failed in process to consumer the message with id ${body.id}`);
	}
	return c.json({ result: true });
});

app.post('/consume-batch', async (c) => {
	try {
		const body = await c.req.json();
		const queueStub = getQueueInstane(c);

		if (queueStub === null) {
			return c.json({ message: 'Durable Object not found' }, 500);
		}

		const items: Array<{ id: string; payload: string | { [key: string]: any } }> = body;

		// await queueStub.consumeBatch(items, handler);
		const handlers = [];
		for (let item of items) {
			console.log(`Consuming the message with id ${item.id}`);
			handlers.push(
				handler(item.payload)
					.then(() => ({
						id: item.id,
					}))
					.catch((error: any) => ({
						id: item.id,
						error,
					}))
			);
		}

		const results = await Promise.allSettled(handlers);
		const idsToDelete: Array<string> = [];
		const idsToIncrementRetries: Array<string> = [];
		results.forEach(async (item) => {
			if (item.status == 'fulfilled') {
				// @ts-ignore
				if (!item.value.error) idsToDelete.push(item.value.id);
				// @ts-ignore
				else if (item.value.error) idsToIncrementRetries.push(item.value.id);
			} else if (item.status == 'rejected') {
				// @ts-ignore
				const id = item.reason.id || item.value.id;
				idsToIncrementRetries.push(id);
			}
		});

		if (idsToDelete.length > 0) await queueStub.deleteMany(idsToDelete);
		if (idsToIncrementRetries.length > 0) await queueStub.incrementRetriesByIds(idsToIncrementRetries);
		console.log(`Consumed the messages with ids: ${idsToDelete.join(',')}`);
		console.log(`Setted to retries the messages with ids: ${idsToIncrementRetries.join(',')}`);
		return c.json({});
	} catch (error) {
		console.log(error);
		return c.json({});
	}
});

app.get('/stats', async (c) => {
	const results: Array<{ id: string; stats: { [key: string]: any } }> = [];

	const mapDOIds: { [key: number]: string } = hashMap.getMapsDOIds();
	const keys = Object.keys(mapDOIds);
	for (let index = 0; index < keys.length; index += 1) {
		// @ts-ignore
		const key: number = keys[index];
		const DOId = mapDOIds[key];
		const env = c.env as Env;
		const queueId = env.QUEUE.idFromName(DOId);
		const queueStub = env.QUEUE.get(queueId) as DurableObjectStub<Queue>;
		if (queueStub === null) {
			return c.json({ message: 'Durable Object not found' }, 500);
		}

		const stats = await queueStub.getStats();
		results.push({
			id: DOId,
			stats: stats,
		});
	}

	return c.json(results);
});

app.get('/stats/:id', async (c) => {
	const id = c.req.param('id');
	const queueStub = getQueueInstane(c, id);
	if (queueStub === null) {
		return c.json({ message: 'Durable Object not found' }, 500);
	}

	const stats = await queueStub.getStats();
	return c.json(stats || {});
});

export default app;
