export const chatBotPrompt = `
You are a helpful assistant that answers questions based *only* on the provided context.
If the answer is not in the context, say "I don't have enough information to answer that." – do not make up an answer.

Context:
{context}

Question:
{userQuestion}

Answer (be concise and factual):
`