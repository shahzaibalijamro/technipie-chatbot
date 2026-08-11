import type { DocumentInterface } from "@langchain/core/documents";
import type { Message } from "./Message.js";
import type { BaseMessage, ChatMessage } from "@langchain/core/messages";
import type { MongoDBChatMessageHistory } from "@langchain/mongodb";
import type { Runnable } from "@langchain/core/runnables";
import { summarizeConversationPrompt } from "./prompt.js";
import { llm } from "../config/llm.js";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { Collection, Document } from "mongodb";

export const combineContext = (chunks: DocumentInterface<Record<string, any>>[]) => {
    return chunks.map(item => item.pageContent).join("\n\n")
}

export const structureMemory = (msgs: BaseMessage[]) => {
    return msgs.map((item) => {
        if (item.type === "human") {
            return `Role: User, Message: ${item.content}`
        } else {
            return `Role: Assistant, Message: ${item.content}`
        }
    }).join("\n")
}


export async function maybeSummarizeConversation(memory: MongoDBChatMessageHistory, sessionsCollection: Collection<Document>) {
    const conversationHistory = await memory.getMessages();
    if (conversationHistory.length < 10) return conversationHistory;
    const summaryChain = summarizeConversationPrompt.pipe(llm).pipe(new StringOutputParser());
    const summary = await summaryChain.invoke({
        conversationChunk: structureMemory(conversationHistory),
    });
    await memory.clear();
    await sessionsCollection.updateOne(
        { sessionId: "sdgsd" },
        { $setOnInsert: { sessionId: "sdgsd", createdAt: new Date() } },
        { upsert: true }
    );
    await memory.addAIMessage(`[Conversation summary] ${summary}`);
    return memory.getMessages();
}