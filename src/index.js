import { config } from 'dotenv';
import { createSearchAgent, chatHistory } from './agents/searchAgent.js';
import readline from 'readline';

config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function formatDate(date) {
    return new Date(date).toLocaleString();
}

function formatSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

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
                        console.log(`\n- ${file.path}`);
                        if (file.metadata) {
                            console.log(`  Modified: ${formatDate(file.metadata.modified)}`);
                            console.log(`  Size: ${formatSize(file.metadata.size)}`);
                        }
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