import { config } from 'dotenv';
import { createSearchAgent, chatHistory } from './agents/searchAgent.js';
import readline from 'readline';

config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    const searchAgent = await createSearchAgent();

    console.log("LLFS initialized. Commands:");
    console.log("- Type 'exit' to quit");
    console.log("- Type 'clear' or 'clear history' to clear search history");
    
    const askQuestion = () => {
        rl.question("\nWhat are you looking for? ", async (query) => {
            const lowerQuery = query.toLowerCase().trim();
            
            // Handle commands
            if (lowerQuery === 'exit') {
                chatHistory.clear();
                rl.close();
                return;
            }
            
            if (lowerQuery === 'clear' || lowerQuery === 'clear history') {
                chatHistory.clear();
                console.log("\nSearch history cleared. Starting fresh!");
                askQuestion();
                return;
            }

            try {
                const result = await searchAgent.invoke({
                    query
                });

                console.log("\nCurrent Context:");
                const context = chatHistory.getRecentContext();
                if (context.length > 0) {
                    console.log(context.map(msg => `${msg.role}: ${msg.content}`).join('\n'));
                } else {
                    console.log("No search history.");
                }

                console.log("\nSearch Results:");
                if (result.refined_results?.length > 0) {
                    result.refined_results.forEach(file => {
                        console.log(`- ${file.path}`);
                    });
                } else {
                    console.log("No files found matching your query.");
                }
            } catch (error) {
                console.error("Error during search:", error);
            }

            askQuestion();
        });
    };

    askQuestion();
}

main().catch(console.error); 