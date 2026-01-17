import { Context, Hono } from 'hono';
import { Env, Queue } from './queue/queue.js';
import { cors } from 'hono/cors';
import { getHTML } from './utils/template.js';
import * as hasher from './utils/hasher.js';
import groups from './../groups.json' with { type: 'json' };
import * as groupUtil from './utils/group.js';
import SCHEMAS_VALIDATIONS from './schemas-validation.js';
import z from 'zod';

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


	try {
		const schema = SCHEMAS_VALIDATIONS[groupUtil.get(groupId)] || null
		if (schema) {
			schema.parse(payload);
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return c.json({
				message: "Validation failed",
				error: JSON.parse(error.message)
			}, 400);
		}
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
	const tab = c.req.query('tab') || 'overview';
	const page = parseInt(c.req.query('page') || '1');
	const limit = 10;
	const offset = (page - 1) * limit;

	const stats = await queueStub.getStats();
	const selectOptions = groups.map(g => `<option value="${g}" ${g === groupId ? 'selected' : ''}>${g}</option>`).join('');

	let content = '';
	let basedLink = `/dashboard?x-api-key=${apiKey}&groupId=${groupId}`
	if (tab === 'messages') {
		const messages = await queueStub.getMessages(limit, offset);
		const totalMessagesRaw = await queueStub.getTotalMessages();
		const totalMessages = Number(totalMessagesRaw) || 0;
		const totalPages = Math.ceil(totalMessages / limit);

		const messageRows = messages.map(msg => {
			const createdAt = new Date(Number(msg.created_at)).toLocaleString();
			const payloadStr = String(msg.payload || '');
			const payloadTruncated = payloadStr.length > 100 ? payloadStr.substring(0, 100) + '...' : payloadStr;
			const statusText = Number(msg.status) === 0 ? 'Pending' : Number(msg.status) === 1 ? 'Processing' : 'Unknown';
			return `
				<tr>
					<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${msg.id}</td>
					<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${msg.url}</td>
					<td class="px-6 py-4 text-sm text-gray-500">${payloadTruncated}</td>
					<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${createdAt}</td>
					<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${statusText}</td>
					<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${msg.retries}</td>
				</tr>
			`;
		}).join('');

		const pagination = [];
		if (page > 1) {
			pagination.push(`<a href="${basedLink}&tab=messages&page=${page - 1}" class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50">Previous</a>`);
		}
		for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
			const activeClass = i === page ? 'bg-indigo-50 border-indigo-500 text-indigo-600' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50';
			pagination.push(`<a href="${basedLink}&tab=messages&page=${i}" class="relative inline-flex items-center px-4 py-2 text-sm font-medium ${activeClass} border">${i}</a>`);
		}
		if (page < totalPages) {
			pagination.push(`<a href="${basedLink}&tab=messages&page=${page + 1}" class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50">Next</a>`);
		}

		content = `
			<div class="px-4 py-0 sm:px-0">
				<!-- Group Selector -->
				<div class="mb-6">
					<label for="groupSelect" class="block text-sm font-medium text-gray-700">Select Group</label>
					<select id="groupSelect" onchange="window.location.href='/dashboard?x-api-key=${apiKey}&groupId=' + this.value + '&tab=messages'" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
						${selectOptions}
					</select>
				</div>

				<!-- Tab Navigation -->
				<div class="mb-6">
					<div class="border-b border-gray-200">
						<nav class="-mb-px flex space-x-8" aria-label="Tabs">
							<a href="${basedLink}" class="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
								Overview
							</a>
							<a href="${basedLink}&tab=messages" class="border-indigo-500 text-indigo-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
								Messages
							</a>
						</nav>
					</div>
				</div>

				<div class="mb-6">
					<div class="bg-white shadow overflow-hidden sm:rounded-md">
						<div class="px-4 py-5 sm:px-6">
							<h3 class="text-lg leading-6 font-medium text-gray-900">Messages (${totalMessages})</h3>
						</div>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
										<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
										<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payload</th>
										<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
										<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
										<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Retries</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									${messageRows}
								</tbody>
							</table>
						</div>
						<div class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
							<div class="flex-1 flex justify-between sm:hidden">
								${page > 1 ? `<a href="${basedLink}&tab=messages&page=${page - 1}" class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Previous</a>` : ''}
								${page < totalPages ? `<a href="${basedLink}&tab=messages&page=${page + 1}" class="ml-3 relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Next</a>` : ''}
							</div>
							<div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
								<div>
									<p class="text-sm text-gray-700">
										Showing <span class="font-medium">${offset + 1}</span> to <span class="font-medium">${Math.min(offset + limit, totalMessages)}</span> of <span class="font-medium">${totalMessages}</span> results
									</p>
								</div>
								<div>
									<nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
										${pagination.join('')}
									</nav>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	} else {
		content = `
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
							<a href="${basedLink}" class="border-indigo-500 text-indigo-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
								Overview
							</a>
							<a href="${basedLink}&tab=messages" class="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
								Messages
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
	}

	const html = getHTML('Dashboard', content);
	return new Response(html, {
		headers: {
			'content-type': 'text/html;charset=UTF-8',
		},
	});
});

export default app;
