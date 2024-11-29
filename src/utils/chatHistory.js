import { encoding_for_model } from "@dqbd/tiktoken";

export class ChatHistory {
    constructor(maxTokens = 4000) {
        this.history = [];
        this.maxTokens = maxTokens;
        this.encoder = encoding_for_model("gpt-3.5-turbo");
    }

    addMessage(role, content) {
        const message = { role, content, timestamp: Date.now() };
        this.history.push(message);
        console.log(`\n=== Adding Message to History ===`);
        console.log(`Role: ${role}`);
        console.log(`Content: ${content}`);
        this.truncateHistory();
    }

    truncateHistory() {
        const originalLength = this.history.length;
        let totalTokens = 0;
        for (let i = this.history.length - 1; i >= 0; i--) {
            const tokens = this.encoder.encode(this.history[i].content).length;
            totalTokens += tokens;
            if (totalTokens > this.maxTokens) {
                this.history = this.history.slice(i + 1);
                console.log(`\n=== History Truncated ===`);
                console.log(`Original messages: ${originalLength}`);
                console.log(`Remaining messages: ${this.history.length}`);
                console.log(`Total tokens: ${totalTokens}`);
                break;
            }
        }
    }

    getRecentContext() {
        return this.history.slice(-5).map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    clear() {
        const hadHistory = this.history.length > 0;
        this.history = [];
        if (hadHistory) {
            console.log("\n=== Chat History Cleared ===");
            console.log("All previous search terms have been removed.");
        }
    }
} 