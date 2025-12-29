interface Message {
	id: string;
	retries: number;
	payload: { [key: string]: any };
}

export default Message;
