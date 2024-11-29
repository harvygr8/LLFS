import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { searchFileSystem } from "../utils/fsSearch.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { searchTerms, generateFileTypeExamples, generateTermsDescription } from "../utils/searchUtils.js";

const searchPrompt = ChatPromptTemplate.fromTemplate(`
You are a file search assistant. Extract ONLY the relevant search terms from the user's query.
DO NOT include any terms that weren't specifically asked for.

User Query: {query}

Rules:
1. Return ONLY terms that match what the user is looking for
2. Separate terms by commas, NO line breaks
3. For folders/directories:
   - Use "${searchTerms.prefixes.directory}" prefix
   - Keep underscores and special characters in folder names
4. For file types and extensions:
   - ALWAYS use "${searchTerms.prefixes.filetype}" prefix when file formats are mentioned
   - Convert format mentions to filetype: (e.g., "pdf files" → "filetype:pdf")
5. DO NOT include these generic words unless part of a name:
   ${searchTerms.ignoreTerms.join(', ')}
6. ALWAYS include content terms that describe the type of file:
${generateTermsDescription()}

Examples:
${generateFileTypeExamples()}
"find pdf files" → filetype:pdf
"search for resume in pdf" → resume,filetype:pdf
"find folder with documents" → dir:documents
"images from last year" → image,2023

Return ONLY comma-separated terms. No other text.`);

export async function createSearchAgent() {
    const model = new ChatOpenAI({
        modelName: "gpt-3.5-turbo",
        temperature: 0
    });

    const workflow = new StateGraph({
        channels: {
            query: {},
            analysis: {},
            refined_results: {}
        }
    });

    workflow.addNode("analyze_query", async (state) => {
        console.log("\n=== Search Analysis ===");
        console.log("Query:", state.query);
        
        const response = await model.invoke([
            new SystemMessage("You are a file search assistant. Extract only relevant search terms."),
            new HumanMessage(await searchPrompt.format({
                query: state.query
            }))
        ]);

        console.log("Extracted terms:", response.content);
        return {
            ...state,
            analysis: response.content,
        };
    });

    workflow.addNode("execute_search", async (state) => {
        console.log("\n=== Executing Search ===");
        const results = await searchFileSystem(state.analysis);
        
        const refined_results = results
            .sort((a, b) => b.score - a.score)
            .map(result => ({
                path: result.path,
                score: result.score
            }));

        console.log(`Found ${refined_results.length} matches`);
        
        return {
            ...state,
            refined_results
        };
    });

    workflow.setEntryPoint("analyze_query");
    workflow.addEdge("analyze_query", "execute_search");
    workflow.addEdge("execute_search", END);

    return workflow.compile();
}