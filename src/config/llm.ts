import { ChatOpenAI } from "@langchain/openai"

if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_MODEL || !process.env.OPENROUTER_BASE_URL) {
    throw new Error("API KEYS NOT FOUND!")
}

export const llm = new ChatOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL,
    configuration: {
        baseURL: process.env.OPENROUTER_BASE_URL
    },
    maxRetries: 6,
    timeout: 60 * 60
})