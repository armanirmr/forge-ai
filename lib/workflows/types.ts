import { z } from "zod";

export const RetrievedContextMetaSchema = z.object({
	keywords: z.array(z.string()),
	snippets: z.array(
		z.object({
			path: z.string(),
			startLine: z.number(),
			endLine: z.number(),
			score: z.number(),
		}),
	),
	fileTreeShown: z.number(),
	fileTreeTotal: z.number(),
	redactions: z.number(),
});
export type RetrievedContextMeta = z.infer<typeof RetrievedContextMetaSchema>;
