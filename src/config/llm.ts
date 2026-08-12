import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

if (!process.env.GEMINI_API_KEY) {
    throw new Error("API KEYS NOT FOUND!")
}

export const llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-3.6-flash",
    maxRetries: 6,
    temperature: 0.1
})