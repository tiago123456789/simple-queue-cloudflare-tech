class MessageSliper {
	private mapDOIds: { [key: number]: string } = {};

	constructor(private readonly size: number) {
		this.setup();
	}

	setup() {
		for (let index = 0; index < this.size; index += 1) {
			if (index == 0) {
				this.mapDOIds[index] = `QUEUE_DO`;
			} else {
				this.mapDOIds[index] = `QUEUE_DO_${index}`;
			}
		}
	}

	private hash(value: string) {
		let result = 0;
		for (let index = 0; index < value.length / 2; index += 1) {
			result += value.charCodeAt(index);
		}
		return result % this.size;
	}

	getId(id: string) {
		const hashValue = this.hash(id);
		return this.mapDOIds[hashValue];
	}

	getMapsDOIds() {
		return this.mapDOIds;
	}
}

export default MessageSliper;
