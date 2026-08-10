import "dotenv/config"
import { PromptTemplate } from "@langchain/core/prompts";
import { llm } from "./config/llm.js";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { embeddingModel } from "./config/embeddingModel.js";
import { connectDB } from "./config/db.js";
import { JsonOutputParser, StringOutputParser } from "@langchain/core/output_parsers";
import { chatBotPrompt } from "./utils/prompt.js";
import { combineContext } from "./utils/utilityFunctions.js";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";

async function main() {
    const { client, dbConfig } = await connectDB();
    const userQuestion = "I'm a startup. I want to build an AI chatbot that answers questions from our company's PDFs. Can Technipie build this?";
    const vectorStore = new MongoDBAtlasVectorSearch(embeddingModel, dbConfig);
    const retriever = vectorStore.asRetriever({ k: 3 });
    const standAloneQuestionTemplate = "Extract the stand alone question from the following user query: {userQuestion}";
    const standAloneQuestionPrompt = PromptTemplate.fromTemplate(standAloneQuestionTemplate);
    const chatBotResponseTemplate = chatBotPrompt;
    const chatBotResponsePrompt = PromptTemplate.fromTemplate(chatBotResponseTemplate);
    const context = standAloneQuestionPrompt
        .pipe(llm)
        .pipe(new StringOutputParser())
        .pipe(retriever)
        .pipe(combineContext);
    const responseChain = chatBotResponsePrompt.pipe(llm).pipe(new StringOutputParser)
    const chain = RunnableSequence.from([
        { context, userQuestion: new RunnablePassthrough() },
        responseChain
    ])

    const response = await chain.invoke({ userQuestion });
    console.log(response)
    await client.close()
}

main();