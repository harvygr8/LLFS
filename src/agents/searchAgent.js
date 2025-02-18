import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { searchFileSystem } from "../utils/fsSearch.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { searchTerms, generateFileTypeExamples, generateTermsDescription } from "../utils/searchUtils.js";
import { ChatHistory } from '../utils/chatHistory.js';

// Create a singleton instance
const chatHistory = new ChatHistory();

export { chatHistory };  // Export the singleton instance
export async function createSearchAgent() {  // Remove parameter since we use singleton
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

    const searchPrompt = ChatPromptTemplate.fromTemplate(`
You are a file search assistant. Extract ONLY the relevant search terms from the user's query.
Consider the conversation context when interpreting the query.

Previous Search Terms:
{context}

Current Query: {query}

Special Commands:
"clear history" or "start fresh" → Clear all previous terms and start new search
"clear" → Clear all previous terms and start new search

File Type Categories:
${generateTermsDescription()}

Common Examples:
${generateFileTypeExamples()}

Examples of context-aware searches:
Previous terms: "(filename)"
"only pdfs" → (filename),filetype:pdf
"clear history and search pdfs" → filetype:pdf  (starts fresh)
"start fresh with images" → image  (starts fresh)

Directory Search Examples:
"find (foldername) folder" → dir:(foldername)
"folders named (foldername)" → dir:(foldername)
"clear and look in (foldername)" → dir:(foldername)  (starts fresh)

Date Search Examples:
"files from yesterday" → time:yesterday
"screenshots from today" → screenshot,time:today
"pdfs from this week" → filetype:pdf,time:thisweek
"images from this month" → image,time:thismonth
"files after March 1st" → time:after:2024-03-01
"documents before 2024" → time:before:2024-01-01
"photos from last week" → image,time:thisweek
"videos from yesterday" → video,time:yesterday

Time Rules:
1. Use exact terms for recent periods:
   - "today" → time:today
   - "yesterday" → time:yesterday
   - "this week" → time:thisweek
   - "this month" → time:thismonth
2. For specific dates:
   - "before (date)" → time:before:YYYY-MM-DD
   - "after (date)" → time:after:YYYY-MM-DD
3. Time terms can be combined with other search terms

Rules:
1. For directory searches, ALWAYS use dir: prefix
2. For file types, ALWAYS use filetype: prefix
3. Multiple terms are separated by commas
4. Keep previous terms unless explicitly told to start fresh

Return ONLY comma-separated terms. No other text.`);

    workflow.addNode("analyze_query", async (state) => {
        console.log("\n=== Search Analysis ===");
        console.log("Query:", state.query);
        
        const recentContext = chatHistory.getRecentContext();
        const previousTerms = recentContext
            .filter(msg => msg.role === 'assistant' && msg.content.includes('Found terms:'))
            .map(msg => msg.content.replace('Found terms: ', ''))
            .filter(terms => terms.length > 0)
            .pop() || '';

        // Format context to explicitly show what terms to maintain
        const contextString = previousTerms ? 
            `Previous search used these terms: ${previousTerms}
             Unless starting a new search, COMBINE these terms with any new filters.
             Example: if adding PDF filter, return "${previousTerms},filetype:pdf"` : 
            'No previous search terms';

        const response = await model.invoke([
            new SystemMessage(`You are a file search assistant. CRITICAL RULES:
            - ALWAYS include previous search terms (${previousTerms}) when adding filters
            - Only remove previous terms if explicitly told to start a new search
            - For folder/directory searches:
              - ALWAYS use "dir:" prefix for EACH directory term
              - Example: "folder named {foldername}" → "dir:{foldername}"
              - Example: "in {foldername1} and {foldername2}" → "dir:{foldername1},dir:{foldername2}"
              - ALWAYS use filetype: prefix for ANY file format mentioned:
                - "pdf" → "filetype:pdf"
                - "docx files" → "filetype:docx"
                - "pdf and docx" → "filetype:pdf,filetype:docx"
            - For time-based searches:
              - ALWAYS convert natural language to time: prefix
                - Example: "from today" → "time:today"
                - Example: "from yesterday" → "time:yesterday"
                - NEVER include words like "from", "in", "and" in the final terms
            - NEVER drop search terms when adding time filters
              - Example: "screenshot from today" → "screenshot,time:today"
              - Example: "pdfs from yesterday" → "filetype:pdf,time:yesterday"
            - Current terms: ${previousTerms}`),
            new HumanMessage(await searchPrompt.format({
                query: state.query,
                context: contextString
            }))
        ]);

        chatHistory.addMessage('user', `Query: ${state.query}`);
        chatHistory.addMessage('assistant', `Found terms: ${response.content}`);

        console.log("\n=== Chat History After Update ===");
        console.log("Total messages in history:", chatHistory.history.length);
        console.log("Last 5 messages:");
        chatHistory.getRecentContext().forEach(msg => {
            console.log(`${msg.role}: ${msg.content}`);
        });

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