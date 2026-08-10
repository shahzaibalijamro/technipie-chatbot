import { OpenAIEmbeddings } from "@langchain/openai";

if (!process.env.NVIDIA_API_KEY || !process.env.NVIDIA_BASE_URL || !process.env.NVIDIA_MODEL) {
    throw new Error("API KEYS NOT FOUND!")
}

export const embeddingModel = new OpenAIEmbeddings({
    apiKey: process.env.NVIDIA_API_KEY,
    configuration: {
        baseURL: process.env.NVIDIA_BASE_URL,
    },
    model: process.env.NVIDIA_MODEL
})