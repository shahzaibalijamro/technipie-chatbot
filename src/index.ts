import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { rateLimit } from "express-rate-limit";
import MongoStore from "rate-limit-mongo";

import { llm } from "./config/llm.js";
import { MongoDBAtlasVectorSearch, MongoDBChatMessageHistory } from "@langchain/mongodb";
import { embeddingModel } from "./config/embeddingModel.js";
import { connectDB } from "./config/db.js";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { chatBotResponsePrompt, standAloneQuestionPrompt } from "./utils/prompt.js";
import { combineContext, structureMemory, maybeSummarizeConversation } from "./utils/utilityFunctions.js";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { ChatMessage } from "@langchain/core/messages";

const app = express();
app.set("trust proxy", 1);

// CORS must be registered FIRST, before anything else that could throw,
// so that even a failure further down the chain still returns CORS headers.
const ALLOWED_ORIGIN = "https://tech-7-miles.vercel.app";
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// --- Rate limiter setup (resilient) ---------------------------------------
// If MongoStore/Mongo connection fails at import time, we don't want that to
// crash the whole serverless function before cors() has a chance to run.
// A failed rate limiter init just means we skip rate limiting rather than
// taking down the entire API (and silently breaking CORS as a side effect).
let limiter: ReturnType<typeof rateLimit> | undefined;
try {
    if (!process.env.MONGODB_URI) {
        console.error("MONGODB_URI is not set — skipping rate limiter init.");
    } else {
        limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 20, // Limit each IP to 20 requests per `window`
            standardHeaders: true,
            legacyHeaders: false,
            store: new MongoStore({
                uri: process.env.MONGODB_URI,
                collectionName: "rateLimits",
                expireTimeMs: 15 * 60 * 1000,
            }),
            message: { error: "Too many requests, please try again later." },
        });
    }
} catch (err) {
    console.error("Failed to initialize rate limiter:", err);
}

if (limiter) {
    app.use("/api/", limiter as any);
} else {
    console.warn("Rate limiter is disabled for this instance.");
}

app.post("/api/chat", async (req, res) => {
    try {
        const { dbConfig, sessionsCollection, logsCollection } = await connectDB();

        const vectorStore = new MongoDBAtlasVectorSearch(embeddingModel, dbConfig);
        const retriever = vectorStore.asRetriever({
            k: 5,
            searchType: "mmr",
            searchKwargs: {
                fetchK: 15,
                lambda: 0.5,
            },
        });

        let sessionId = req.cookies.sessionId;
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            res.cookie("sessionId", sessionId, { httpOnly: true }); // Session cookie
        }

        const { question } = req.body;
        if (!question) {
            return res.status(400).json({ error: "Question is required." });
        }

        const memory = new MongoDBChatMessageHistory({ collection: sessionsCollection, sessionId });
        const logger = new MongoDBChatMessageHistory({ collection: logsCollection, sessionId });

        await sessionsCollection.updateOne(
            { sessionId },
            { $setOnInsert: { sessionId, createdAt: new Date() } },
            { upsert: true }
        );

        memory.addUserMessage(question);
        logger.addMessage(new ChatMessage(question, "user"));

        const contextChain = standAloneQuestionPrompt
            .pipe(llm)
            .pipe(new StringOutputParser())
            .pipe(prev => {
                logger.addMessage(new ChatMessage(prev, "standalone-question"));
                console.log(prev)
                // Fallback to original question if LLM returns empty string
                return prev.trim() ? prev : question;
            })
            .pipe(retriever)
            .pipe(prev => {
                logger.addMessage(new ChatMessage(JSON.stringify(prev), "retrieved-chunks"));
                console.log(prev)
                return prev;
            })
            .pipe(combineContext);

        const responseChain = chatBotResponsePrompt.pipe(llm).pipe(new StringOutputParser());

        const chain = RunnableSequence.from([
            { context: contextChain, og_input: new RunnablePassthrough() },
            { context: prev => prev.context, userQuestion: prev => prev.og_input.userQuestion, memory: prev => prev.og_input.memory },
            responseChain
        ]);

        const conversationHistory = await maybeSummarizeConversation(memory, sessionsCollection);
        logger.addMessage(new ChatMessage(JSON.stringify(conversationHistory), "memory"));

        const response = await chain.invoke({ userQuestion: question, memory: structureMemory(conversationHistory) });

        logger.addMessage(new ChatMessage(response, "chatbot-response"));
        memory.addAIMessage(response);

        res.json({ answer: response, sessionId });

    } catch (error: any) { // Type-cast or type-narrow the error
        console.error("Error in /api/chat:", error);

        // Safely check for Google/HTTP status codes
        const statusCode = error?.status || error?.response?.status;

        if (statusCode === 429) {
            return res.status(429).json({
                error: "The AI service is currently busy due to rate limits. Please wait a few moments and try again."
            });
        }

        return res.status(500).json({ error: "We're having trouble right now, try again shortly." });
    }
});

// --- Catch-all error handler ------------------------------------------------
// Safety net for any error thrown outside the route's own try/catch (e.g. in
// middleware). Because cors() is registered before this, the CORS headers it
// already attached to the response will still be present on error responses.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
});

export default app;