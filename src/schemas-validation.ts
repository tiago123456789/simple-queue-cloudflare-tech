import { z } from 'zod';

const SCHEMAS_VALIDATIONS: { [key: string]: z.Schema } = {
	queue2: z.object({
		userId: z.number(),
		id: z.number(),
		title: z.string(),
		completed: z.boolean(),
	}),
};

export default SCHEMAS_VALIDATIONS;
