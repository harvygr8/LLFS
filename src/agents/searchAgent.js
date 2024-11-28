import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { searchFileSystem, DEFAULT_SEARCH_PATHS } from "../utils/fsSearch.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const searchPrompt = ChatPromptTemplate.fromTemplate(`
You are a file search assistant. Your task is to extract ONLY the relevant search terms from the user's query.
DO NOT include any terms that weren't specifically asked for.

User Query: {query}

Rules:
1. Return ONLY terms that match what the user is looking for
2. Separate terms by commas, NO line breaks
3. For folders/directories:
   - Use "dir:" prefix
   - Keep underscores and special characters in folder names
   - Keep the full folder name intact
4. DO NOT include generic words like "files" or "documents" unless they're part of the actual name
5. DO NOT include file extensions unless specifically requested
6. DO NOT include terms for things the user didn't ask about

Examples:
"find my resume files" → resume
"resume files" → resume
"find folder with my projects" → dir:projects
"looking for academic_files folder" → dir:academic_files
"find my test_results_2023 directory" → dir:test_results_2023
"tax documents from 2023" → tax2023
"photos and videos" → photo,video

Return ONLY the relevant terms as a single comma-separated list. No other text or formatting.
`);

const refinePrompt = ChatPromptTemplate.fromTemplate(`
You are a file search refinement assistant. Given the original query and a list of found files,
rank and filter the results based on relevance.

Original Query: {query}
Found Files (with scores):
{files}

Guidelines:
1. ONLY return paths from the list provided above - do not generate or modify paths
2. For directory searches:
   - Keep ONLY directories whose names EXACTLY match the search term
   - The match must be the complete directory name, not just a part of it
3. For ALL searches:
   - ALWAYS include ALL files with the highest score (6)
   - ALWAYS include ALL files with the second-highest score (5)
   - For remaining files:
     - Keep at least 25% of files with scores >= 3
     - Sort by score in descending order
4. For resume/CV searches:
   - Keep ALL files that appear to be resumes (score >= 3)
   - Include files with personal names (e.g., john_smith_resume.pdf)
   - Include variations like "CV", "curriculum_vitae", etc.
   - Prioritize common document formats (.pdf, .doc, .docx)
5. NEVER include:
   - node_modules directories
   - system directories
   - configuration files (.config, .json, etc.) unless specifically requested
   - temporary files or build artifacts

Return only the exact file paths from the list above, one per line, sorted by score (highest first).
Do not modify the paths or generate new ones.
`);

export async function createSearchAgent() {
    const model = new ChatOpenAI({
        modelName: "gpt-3.5-turbo",
        temperature: 0,
    });

    const workflow = new StateGraph({
        channels: {
            query: {},
            analysis: {},
            results: {},
            refined_results: {}
        }
    });

    workflow.addNode("analyze_query", async (state) => {
        console.log("\n=== Search Analysis ===");
        console.log("Original query:", state.query);
        
        const response = await model.invoke(await searchPrompt.format({ 
            query: state.query 
        }));
        
        console.log("Processed search terms:", response.content);
        return {
            ...state,
            analysis: response.content,
        };
    });

    workflow.addNode("execute_search", async (state) => {
        console.log("\n=== Executing Search ===");
        const results = await searchFileSystem(state.analysis);
        console.log(`Found ${results.length} total matches`);
        return {
            ...state,
            results,
        };
    });

    workflow.addNode("refine_results", async (state) => {
        console.log("\n=== refinement process ===");
        
        // group by score
        const resultsByScore = state.results.reduce((acc, curr) => {
            acc[curr.score] = acc[curr.score] || [];
            acc[curr.score].push(curr);
            return acc;
        }, {});
        
        // get scores in descending order
        const scores = Object.keys(resultsByScore)
            .map(Number)
            .sort((a, b) => b - a);
        
        console.log("\ninitial score distribution:");
        scores.forEach(score => {
            console.log(`score ${score}: ${resultsByScore[score].length} files`);
        });

        // format for llm
        const formattedResults = state.results
            .map(result => `${result.path} (score: ${result.score})`)
            .join('\n');

        const response = await model.invoke(await refinePrompt.format({
            query: state.query,
            files: formattedResults
        }));

        const refined_results = response.content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('-'));

        // ensure all top scores are included
        const highestScore = scores[0] || 0;
        const secondHighestScore = scores[1] || 0;
        
        const mandatoryFiles = state.results
            .filter(r => r.score >= Math.min(5, Math.max(highestScore, secondHighestScore)))
            .map(r => r.path);
        
        // combine mandatory with llm selection
        const finalResults = [...new Set([...mandatoryFiles, ...refined_results])];

        console.log("\n=== final results ===");
        console.log(`total matches: ${finalResults.length}`);
        console.log("including:");
        console.log(`- all files with score ${highestScore} (top score)`);
        console.log(`- all files with score ${secondHighestScore} (second best)`);
        console.log(`- minimum 25% of other relevant files (score >= 3)`);

        return {
            ...state,
            refined_results: finalResults,
        };
    });

    workflow.setEntryPoint("analyze_query");
    workflow.addEdge("analyze_query", "execute_search");
    workflow.addEdge("execute_search", "refine_results");
    workflow.addEdge("refine_results", END);

    return workflow.compile();
}