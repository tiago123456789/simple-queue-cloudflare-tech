import { DurableObject } from 'cloudflare:workers';
import axios from 'axios';

import Message from '../types/message.js';
import STATUS from '../types/status.js';

export interface Env {
	QUEUE: DurableObjectNamespace<Queue>;
	API_KEY: string;
	INTERVAL_SECONDS_POLLING: number;
	VISIBILITY_TIMEOUT: number;
	CONSUMER_URL: string;
	TOTAL_MESSAGE_PROCESS_PER_TIME: number;
	ENABLED_CONSUMER_BATCH_MODE: boolean;
}

export class Queue extends DurableObject {
	private consumersUrl: Array<string>;
	private position: number = 0;
	private inMemoryMessages: Array<Message> = [];

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.consumersUrl = (this.env as Env).CONSUMER_URL.split(',');

		ctx.blockConcurrencyWhile(async () => {
			await this.migrate();
		});
	}

	private async migrate() {
		await this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS queue(
				id TEXT PRIMARY KEY,
				payload TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				status INTEGER,
				retries INTEGER DEFAULT 0,
				visibility INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS queue_idx ON queue(id);

			CREATE TABLE IF NOT EXISTS queue_dlq(
				id TEXT PRIMARY KEY,
				payload TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				status INTEGER,
				retries INTEGER DEFAULT 0,
				visibility INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS queue_dlq_idx ON queue_dlq(id);
			`);
	}

	private getDateNexPolling(): Date {
		const currentTime = new Date();
		currentTime.setSeconds(currentTime.getSeconds() + (this.env as Env).INTERVAL_SECONDS_POLLING);
		return currentTime;
	}

	async deleteMany(ids: Array<string>) {
		const idsDelete = ids.map((id) => id).join("','");
		await this.ctx.storage.sql.exec(`DELETE FROM queue WHERE id in ('${idsDelete}');`);
	}

	private async moveMessageToDlq(items: Array<{ [key: string]: any }>) {
		await this.ctx.storage.transactionSync(async () => {
			let query: string = '';

			for (const data of items) {
				const id = crypto.randomUUID();

				query += `INSERT INTO queue_dlq (id, payload, created_at, status, visibility) VALUES ('${id}', '${JSON.stringify(
					data.payload
				)}', '${Date.now()}', '${STATUS.PENDING}', '${Date.now()}');`;
			}

			try {
				await this.ctx.storage.sql.exec(query);
				console.log(`Successfully inserted ${items.length} rows in a batch.`);
			} catch (error) {
				console.error('Batch insert failed:', error);
			}
		});
	}

	private parsePayload(payload: string): string | { [key: string]: any } {
		try {
			payload = JSON.parse(payload);
		} catch (error) {}

		return payload;
	}

	async addBatch(items: Array<{ id: string; payload: { [key: string]: any } }>, isPublishedInBatch: boolean) {
		let query = '';
		for (let index = 0; index < items.length; index += 1) {
			try {
				// @ts-ignore
				items[index].payload = JSON.stringify({
					...items[index].payload,
					isPublishedInBatch,
				});
			} catch (error) {
				items[index].payload = items[index].payload;
			}

			const createdAt = Date.now();
			const visibility = new Date();

			visibility.setSeconds(visibility.getSeconds() + (this.env as Env).VISIBILITY_TIMEOUT + 5);
			query += `INSERT INTO queue (id, payload, created_at, status, visibility) VALUES ('${items[index].id}', '${
				items[index].payload
			}', '${createdAt}', '${STATUS.PENDING}', '${visibility.getTime()}');`;
		}

		await this.ctx.storage.transactionSync(async () => {
			try {
				await this.ctx.storage.sql.exec(query);
				console.log(`Successfully inserted ${items.length} rows in a batch.`);
			} catch (error) {
				console.error('Batch insert failed:', error);
			}
		});
	}

	async addToQueue(id: string, payload: { [key: string]: any }) {
		if (this.inMemoryMessages.length <= 200) {
			this.inMemoryMessages.push({
				id: id,
				retries: 0,
				payload: payload,
			});

			const alarm = await this.ctx.storage.getAlarm();
			if (!alarm) {
				const date5secondLater = new Date();
				date5secondLater.setSeconds(date5secondLater.getSeconds() + 2);
				await this.ctx.storage.setAlarm(date5secondLater);
			}
			return;
		} else {
			await this.addBatch(this.inMemoryMessages, false);
			this.inMemoryMessages = [];
			return;
		}
	}

	private getConsumerUrl() {
		let url = this.consumersUrl[this.position];
		if (!url) {
			this.position = 0;
			url = this.consumersUrl[this.position];
		} else {
			this.position += 1;
		}

		return url;
	}

	async alarm() {
		if (this.inMemoryMessages.length > 0) {
			await this.addBatch(this.inMemoryMessages, false);
			this.inMemoryMessages = [];
		}

		const messages = await this.getNextFromQueue((this.env as Env).TOTAL_MESSAGE_PROCESS_PER_TIME);
		if (messages.length == 0) {
			await this.ctx.storage.setAlarm(this.getDateNexPolling());
			return;
		}

		const idsDelete = [];
		const itemsSendDlq = [];
		const hasConsumerBatchModelEnabled = (this.env as Env).ENABLED_CONSUMER_BATCH_MODE;
		let items = [];

		for (const message of messages) {
			if (message.retries > 3) {
				idsDelete.push(message.id);
				itemsSendDlq.push(message);
				continue;
			}

			if (hasConsumerBatchModelEnabled) {
				items.push({
					id: message.id,
					payload: message.payload,
				});

				if (items.length == 4) {
					let url = this.getConsumerUrl();

					axios.post(url + '-batch', items, {
						headers: {
							'x-api-key': (this.env as Env).API_KEY,
						},
					});
					items = [];
				}
				continue;
			}

			let url = this.getConsumerUrl();
			axios.post(
				url,
				{
					id: message.id,
					payload: message.payload,
				},
				{
					headers: {
						'x-api-key': (this.env as Env).API_KEY,
					},
				}
			);
		}

		if (hasConsumerBatchModelEnabled && items.length > 0) {
			axios.post((this.env as Env).CONSUMER_URL + '-batch', items, {
				headers: {
					'x-api-key': (this.env as Env).API_KEY,
				},
			});
			items = [];
		}

		if (idsDelete.length > 0) {
			await this.deleteMany(idsDelete);
			await this.moveMessageToDlq(itemsSendDlq);
		}
		const nextAlarmTime = new Date();
		nextAlarmTime.setSeconds(nextAlarmTime.getSeconds() + 10);
		await this.ctx.storage.setAlarm(nextAlarmTime);
	}

	async getNextFromQueue(limit: number = 1): Promise<Array<Message>> {
		const results = await this.ctx.storage.sql.exec(
			`UPDATE queue SET status = '${STATUS.PROCESSING}' WHERE id in (SELECT id FROM queue WHERE status = '${
				STATUS.PENDING
			}' OR (visibility < ${Date.now()} AND status = ${
				STATUS.PROCESSING
			}) ORDER BY created_at ASC LIMIT ${limit}) RETURNING id, payload, retries;`
		);

		const items = results.toArray();

		if (!items[0]) {
			return [];
		}

		return items.map(
			(item) =>
				({
					retries: item.retries?.valueOf(),
					id: item.id?.valueOf(),
					payload: this.parsePayload(item.payload as string),
				} as Message)
		);
	}

	async getAll(offset: number = 0, limit: number = 20) {
		const results = await this.ctx.storage.sql.exec(
			`SELECT retries, id, payload, status, visibility FROM queue ORDER BY created_at ASC LIMIT ${limit} OFFSET ${offset} ;`
		);
		const items = results.toArray();

		return items.map((item: { [key: string]: any }) => {
			let payload = this.parsePayload(item.payload);
			return {
				retries: item.retries,
				id: item.id,
				status: item.status,
				visibility: item.visibility,
				payload: payload,
			};
		});
	}

	async getAllDlq(offset: number = 0, limit: number = 20) {
		const results = await this.ctx.storage.sql.exec(
			`SELECT retries, id, payload, status, visibility FROM queue_dlq ORDER BY created_at ASC LIMIT ${limit} OFFSET ${offset} ;`
		);
		const items = results.toArray();

		return items.map((item: { [key: string]: any }) => {
			let payload = this.parsePayload(item.payload);
			return {
				retries: item.retries,
				id: item.id,
				status: item.status,
				visibility: item.visibility,
				payload: payload,
			};
		});
	}

	async getStats() {
		const totalMessagesDql = await this.ctx.storage.sql.exec(`SELECT count(id) as total FROM queue_dlq;`);
		const totalMessagesPending = await this.ctx.storage.sql.exec(`SELECT count(id) as total FROM queue where status = ${STATUS.PENDING};`);
		const totalMessagesProcessing = await this.ctx.storage.sql.exec(
			`SELECT count(id) as total FROM queue where status = ${STATUS.PROCESSING};`
		);

		const totalMessagesWaitingRetry = await this.ctx.storage.sql.exec(
			`SELECT count(id) as total FROM queue where retries > 0 and status = ${STATUS.PENDING};`
		);

		return {
			totalMessagesDql: totalMessagesDql.toArray()[0].total,
			totalMessagesPending: totalMessagesPending.toArray()[0].total,
			totalMessagesProcessing: totalMessagesProcessing.toArray()[0].total,
			totalMessagesWaitingRetry: totalMessagesWaitingRetry.toArray()[0].total,
		};
	}

	async delete(id: string) {
		await this.ctx.storage.sql.exec(`DELETE FROM queue WHERE id = '${id}';`);
	}

	async incrementRetries(id: string) {
		await this.ctx.storage.sql.exec(`UPDATE queue SET status = ${STATUS.PENDING}, retries = retries + 1 WHERE id = '${id}';`);
	}

	async incrementRetriesByIds(ids: Array<string>) {
		const idsUpdate = ids.map((id) => id).join("','");
		await this.ctx.storage.sql.exec(`UPDATE queue SET status = ${STATUS.PENDING}, retries = retries + 1 WHERE id in ('${idsUpdate}');`);
	}

	async setupAlarm() {
		console.log('Starting setup alarm');
		const messages = await this.getAll(0, 1);
		if (messages.length == 0) {
			console.log("Stopped here because queue doesn't have message");
			return;
		}
		console.log('Setting the alarm now');
		await this.ctx.storage.setAlarm(Date.now());
	}
}
