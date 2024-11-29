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

    console.log("LLFS initialized. Type 'exit' to quit.");
    
    const askQuestion = () => {
        rl.question("\nWhat are you looking for? ", async (query) => {
            if (query.toLowerCase() === 'exit') {
                chatHistory.clear();
                rl.close();
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