import axios from 'axios';
import Message from '../types/message.js';
import STATUS from '../types/status.js';
import { DurableObject } from 'cloudflare:workers';

export interface Env {
	QUEUE: DurableObjectNamespace<Queue>;
	API_KEY: string;
	HTTP_REQUEST_TIMEOUT: number;
	TOTAL_RETRIES_BEFORE_DQL: number;
	TOTAL_MESSAGES_PULL_PER_TIME: number;
}

export class Queue extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			await this.migrate();
		});
	}

	private async migrate() {
		await this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS queue(
				id TEXT PRIMARY KEY,
				url TEXT NOT NULL,
				payload TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				status INTEGER,
				retries INTEGER DEFAULT 0
			);
			CREATE INDEX IF NOT EXISTS queue_idx ON queue(id);

			CREATE TABLE IF NOT EXISTS queue_dlq(
				id TEXT PRIMARY KEY,
				url TEXT NOT NULL,
				payload TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				status INTEGER,
				retries INTEGER DEFAULT 0
			);
			CREATE INDEX IF NOT EXISTS queue_dlq_idx ON queue_dlq(id);
	`);
	}

	private async delete(id: string) {
		await this.ctx.storage.sql.exec(`DELETE FROM queue WHERE id = ?;`, ...[id]);
	}

	private async process(message: Message) {
		let url = message.url;

		try {
			console.log('Processing message with id:', message.id);
			await axios.post(url, message.payload, {
				timeout: (this.env as Env).HTTP_REQUEST_TIMEOUT * 1000,
				headers: {
					'User-Agent': 'SimpleQueue',
					'x-api-key': (this.env as Env).API_KEY,
				},
			});

			console.log('Removing message with id:', message.id, 'because processed with success');
			await this.delete(message.id);
		} catch (error) {
			console.error(error);
			console.log('Increasing the retries of message with id:', message.id, 'because failed');
			await this.incrementRetriesById(message.id);
		}
	}

	private async incrementRetriesById(id: string) {
		await this.ctx.storage.sql.exec(
			`UPDATE queue SET status = ?, retries = retries + 1, created_at = ? WHERE id = ?`,
			...[STATUS.PENDING, Date.now(), id]
		);
	}

	private async getNextFromQueue(limit: number = 1): Promise<Array<Message>> {
		const results = await this.ctx.storage.sql.exec(
			`UPDATE queue SET status = ?
			WHERE id in (SELECT id FROM queue WHERE status = ? ORDER BY created_at ASC LIMIT ?)
			RETURNING id, url, payload, retries;`,
			...[STATUS.PROCESSING, STATUS.PENDING, limit]
		);

		const items = results.toArray();
		if (!items[0]) {
			return [];
		}

		return items.map((item) => {
			return {
				id: item.id,
				url: item.url,
				retries: item.retries,
				payload: item.payload,
			} as Message;
		});
	}

	private async moveMessageToDlq(item: Message) {
		await this.ctx.storage.sql.exec(
			`INSERT INTO queue_dlq(id, url, payload, created_at, status)
			VALUES (?, ?, ?, ?, ?)`,
			...[item.id, item.url, JSON.stringify(item.payload), Date.now(), STATUS.PENDING]
		);
	}

	async consume(limitPerTime: number = 1) {
		const messages = await this.getNextFromQueue(limitPerTime);
		if (messages.length == 0) {
			return;
		}

		let requestTriggerParallel = [];
		for (let message of messages) {
			if (message.retries > (this.env as Env).TOTAL_RETRIES_BEFORE_DQL) {
				console.log('Moving message with id:', message.id, 'because reached the total of retries');
				await this.moveMessageToDlq(message);
				await this.delete(message.id);
			} else {
				requestTriggerParallel.push(this.process(message));
			}
		}

		await Promise.all(requestTriggerParallel);
		requestTriggerParallel = [];
	}

	async add(id: string, url: string, payload: { [key: string]: any }) {
		await this.ctx.storage.sql.exec(
			`INSERT INTO queue (id, url, payload, created_at, status)
			VALUES (?, ?, ?, ?, ?)`,
			...[id, url, JSON.stringify(payload), Date.now(), STATUS.PENDING]
		);
	}

	async getStats() {
		const totalMessagesDql = await this.ctx.storage.sql.exec(`SELECT count(id) as total FROM queue_dlq;`);
		const totalMessagesPending = await this.ctx.storage.sql.exec(
			`SELECT count(id) as total FROM queue where status = ? AND retries = 0;`,
			...[STATUS.PENDING]
		);
		const totalMessagesProcessing = await this.ctx.storage.sql.exec(
			`SELECT count(id) as total FROM queue where status = ?;`,
			...[STATUS.PROCESSING]
		);

		const totalMessagesWaitingRetry = await this.ctx.storage.sql.exec(
			`SELECT count(id) as total FROM queue where retries > 0 and status = ?;`,
			...[STATUS.PENDING]
		);

		return {
			totalMessagesDql: totalMessagesDql.toArray()[0].total,
			totalMessagesPending: totalMessagesPending.toArray()[0].total,
			totalMessagesProcessing: totalMessagesProcessing.toArray()[0].total,
			totalMessagesWaitingRetry: totalMessagesWaitingRetry.toArray()[0].total,
		};
	}
}
