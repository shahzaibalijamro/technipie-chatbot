import { MongoClient } from "mongodb";


export async function connectDB() {
    if (!process.env.MONGODB_URI) {
        throw new Error("API KEYS NOT FOUND!")
    }
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        // Connect to MongoDB
        await client.connect();

        // Configure your MongoDB collection
        const database = client.db("technipie-chatbot");
        const collection = database.collection("test");
        const sessionsCollection = database.collection("sessions");
        const logsCollection = database.collection("logs")
        await sessionsCollection.createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 60 * 60 * 24 }
        );
        const dbConfig = {
            collection,
            indexName: "vector_index",
            textKey: "text",
            embeddingKey: "embedding",
        };
        return {
            dbConfig,
            client,
            sessionsCollection,
            logsCollection
        };
    } catch (error) {
        // If connection fails, close the client to avoid resource leaks
        await client.close().catch(() => { });
        // Rethrow with context
        if (error instanceof Error) {
            throw new Error(`MongoDB connection error: ${error.message}`, { cause: error });
        } else {
            throw new Error(`MongoDB connection error: ${String(error)}`);
        }
    }
}