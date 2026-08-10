import type { DocumentInterface } from "@langchain/core/documents";

export const combineContext = (chunks: DocumentInterface<Record<string, any>>[]) => {
    return chunks.map(item => item.pageContent).join("\n\n")
}