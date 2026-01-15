import { Context, Hono } from 'hono';
import { Env, Queue } from './queue/queue.js';
import { cors } from 'hono/cors';
import { getHTML } from './utils/template.js';
import * as hasher from './utils/hasher.js';
import groups from './../groups.json' with { type: 'json' };
import * as groupUtil from './utils/group.js';

const groupsAllowed: { [key: string]: boolean } = {};
groups.forEach((group: string) => {
	groupsAllowed[`${group}`] = true;
});

export { Queue };

const app = new Hono();

app.use('*', cors());

app.use('*', async (c, next) => {
	const apiKey = c.req.header('x-api-key') || c.req.query('x-api-key');

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

function getQueueInstance(c: Context, groupId?: string) {
	const env = c.env as Env;
	let queueId = env.QUEUE.idFromName(groupUtil.get(groupId));
	const queueStub = env.QUEUE.get(queueId) as DurableObjectStub<Queue>;
	return queueStub;
}

app.post('/publish', async (c) => {
	const url = c.req.query('url');
	const payload = await c.req.json();

	if (!url) {
		return c.json({ message: 'Url is required' }, 404);
	}

	let groupId = c.req.query('groupId');
	if (!groupsAllowed[groupUtil.get(groupId)]) {
		return c.json({ message: 'Group id not found' }, 404);
	}

	const queueStub = getQueueInstance(c, groupUtil.get(groupId));
	if (queueStub === null) {
		return c.json({ message: 'Queue not found' }, 500);
	}

	const jsonString = JSON.stringify(payload);
	const id = await hasher.get(jsonString);
	const storedMessage = await queueStub.add(id, url as string, payload);
	return c.json({ storedMessage: storedMessage });
});

app.get('/process', async (c) => {
	let groupId = c.req.query('groupId');
	if (!groupsAllowed[groupUtil.get(groupId)]) {
		return c.json({ message: 'Group id not found' }, 404);
	}

	const queueStub = getQueueInstance(c, groupUtil.get(groupId));
	if (queueStub === null) {
		return c.json({ message: 'Queue not found' }, 500);
	}

	const limit = (c.env as Env).TOTAL_MESSAGES_PULL_PER_TIME;
	await queueStub.consume(limit);
	return c.json({ ok: true });
});

app.get('/stats', async (c) => {
	let groupId = c.req.query('groupId');
	if (!groupsAllowed[groupUtil.get(groupId)]) {
		return c.json({ message: 'Group id not found' }, 404);
	}

	const queueStub = getQueueInstance(c, groupUtil.get(groupId));
	if (queueStub === null) {
		return c.json({ message: 'Durable Object not found' }, 500);
	}

	const stats = await queueStub.getStats();
	return c.json(stats);
});

app.get('/dashboard', async (c) => {
	const groupId = groupUtil.get(c.req.query('groupId'));
	const queueStub = getQueueInstance(c, groupId);
	if (queueStub === null) {
		return c.json({ message: 'Durable Object not found' }, 500);
	}

	const apiKey = c.req.header('x-api-key') || c.req.query('x-api-key');
	const stats = await queueStub.getStats();
	const selectOptions = groups.map(g => `<option value="${g}" ${g === groupId ? 'selected' : ''}>${g}</option>`).join('');
	const content = `
          <div class="px-4 py-0 sm:px-0">
            <!-- Group Selector -->
            <div class="mb-6">
              <label for="groupSelect" class="block text-sm font-medium text-gray-700">Select Group</label>
              <select id="groupSelect" onchange="window.location.href='/dashboard?x-api-key=${apiKey}&groupId=' + this.value" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                ${selectOptions}
              </select>
            </div>

            <!-- Tab Navigation -->
            <div class="mb-6">
              <div class="border-b border-gray-200">
                <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                  <a href="/dashboard?groupId=${groupId}" class="border-indigo-500 text-indigo-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                    Overview
                  </a>
                </nav>
              </div>
            </div>
            
            <div class="mb-6">
              <div class="bg-white shadow rounded-lg p-6">
                <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                  <div class="text-center">
                    <div class="text-2xl font-bold text-blue-600">${stats.totalMessagesDql}</div>
                    <div class="text-sm text-gray-500">Total of message on dead letter queue</div>
                  </div>
                  <div class="text-center">
                    <div class="text-2xl font-bold text-yellow-600">${stats.totalMessagesPending}</div>
                    <div class="text-sm text-gray-500">Total messages pending</div>
                  </div>
                  <div class="text-center">
                    <div class="text-2xl font-bold text-purple-600">${stats.totalMessagesProcessing}</div>
                    <div class="text-sm text-gray-500">Total messages processing</div>
                  </div>
                  <div class="text-center">
                    <div class="text-2xl font-bold text-green-600">${stats.totalMessagesWaitingRetry}</div>
                    <div class="text-sm text-gray-500">Total message waiting to retry</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

	const html = getHTML('Dashboard', content);
	return new Response(html, {
		headers: {
			'content-type': 'text/html;charset=UTF-8',
		},
	});
});

export default app;
