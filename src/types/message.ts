interface Message {
	id: string;
	retries: number;
	url: string;
	payload: { [key: string]: any };
}

export default Message;
