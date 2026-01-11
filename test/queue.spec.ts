import { env } from 'cloudflare:test';
import axios from 'axios';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('Queue', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('Should add a message to the queue', async () => {
		const id = env.QUEUE.idFromName('test');
		const queue = env.QUEUE.get(id);
		await queue.add('test-id', 'http://example.com', { key: 'value' });
		const stats = await queue.getStats();
		expect(1).toBe(stats.totalMessagesPending);
	});

	it('Should remove message from queue after process message with success', async () => {
		const id = env.QUEUE.idFromName('test');
		const queue = env.QUEUE.get(id);
		await queue.add('test-id', 'http://example.com', { key: 'value' });
		let stats = await queue.getStats();
		expect(1).toBe(stats.totalMessagesPending);

		await queue.consume();
		stats = await queue.getStats();
		expect(0).toBe(stats.totalMessagesPending);
	});

	it('Should update column retries if request failed when process a message', async () => {
		const id = env.QUEUE.idFromName('test');
		const queue = env.QUEUE.get(id);
		await queue.add('test-id', 'http://example.com', { key: 'value' });
		mockedAxios.post.mockRejectedValueOnce({
			response: {
				status: 404,
				data: { mesage: 'Invalid the requests.' },
			},
		});
		await queue.consume();
		let stats = await queue.getStats();
		expect(1).toBe(stats.totalMessagesWaitingRetry);
	});
});
