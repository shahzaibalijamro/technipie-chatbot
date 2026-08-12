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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

async function startServer() {
    const { dbConfig, sessionsCollection, logsCollection } = await connectDB();

    const vectorStore = new MongoDBAtlasVectorSearch(embeddingModel, dbConfig);
    const retriever = vectorStore.asRetriever({
        k: 5,
        searchType: "mmr",
        searchKwargs: {
            fetchK: 15,  // pool size pulled before MMR reranks it down to k
            lambda: 0.5, // 0 = max diversity, 1 = pure similarity (your old behavior)
        },
    });

    // Configure rate limiting
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20, // Limit each IP to 50 requests per `window`
        standardHeaders: true,
        legacyHeaders: false,
        store: new MongoStore({
            uri: process.env.MONGODB_URI!,
            collectionName: "rateLimits",
            expireTimeMs: 15 * 60 * 1000
        }),
        message: { error: "Too many requests, please try again later." }
    });

    app.use("/api/", limiter as any);

    app.post("/api/chat", async (req, res) => {
        try {
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

        } catch (error) {
            console.error("Error in /api/chat:", error);
            res.status(500).json({ error: "We're having trouble right now, try again shortly." });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

startServer().catch(console.error);