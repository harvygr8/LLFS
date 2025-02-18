import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileTypes, penalties } from './searchUtils.js';

// default search paths
export const DEFAULT_SEARCH_PATHS = [
    process.cwd(),                    // current directory
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), 'Desktop')
];

// Add MAX_SCORE as a constant at the top level
const MAX_SCORE = 6;

// Add metadata extraction function
async function getFileMetadata(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return {
            created: stats.birthtime,
            modified: stats.mtime,
            accessed: stats.atime,
            size: stats.size,
            isDirectory: stats.isDirectory()
        };
    } catch (error) {
        console.error(`Error getting metadata for ${filePath}:`, error);
        return null;
    }
}

// Add date matching function
function matchesDateFilter(metadata, dateFilter) {
    if (!dateFilter || !metadata) return true;
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check both created and modified dates
    const fileCreated = new Date(metadata.created);
    const fileModified = new Date(metadata.modified);
    
    const checkDate = (fileDate) => {
        switch(dateFilter) {
            case 'today':
                return fileDate.toDateString() === today.toDateString();
            case 'yesterday':
                return fileDate.toDateString() === yesterday.toDateString();
            case 'thisweek':
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return fileDate >= weekAgo;
            case 'thismonth':
                return fileDate.getMonth() === today.getMonth() && 
                       fileDate.getFullYear() === today.getFullYear();
            default:
                if (dateFilter.startsWith('before:')) {
                    const date = new Date(dateFilter.replace('before:', ''));
                    return fileDate < date;
                }
                if (dateFilter.startsWith('after:')) {
                    const date = new Date(dateFilter.replace('after:', ''));
                    return fileDate > date;
                }
                return true;
        }
    };
    
    // Return true if either creation or modification date matches
    return checkDate(fileCreated) || checkDate(fileModified);
}

function scoreDirMatch(fullPath, dirTerm) {
    const normalizedPath = fullPath.toLowerCase();
    const normalizedTerm = dirTerm.toLowerCase();
    const pathParts = normalizedPath.split(path.sep);
    
    // Exact directory name match
    if (pathParts.includes(normalizedTerm)) {
        return MAX_SCORE;
    }
    
    // Match part of directory name
    if (pathParts.some(part => part.includes(normalizedTerm))) {
        return MAX_SCORE - 1;
    }
    
    // Match anywhere in path
    if (normalizedPath.includes(normalizedTerm)) {
        return MAX_SCORE - 2;
    }
    
    return 0;
}

function scoreMatch(fileName, term) {
    const nameWithoutExt = fileName.toLowerCase().replace(/\.[^/.]+$/, "");
    const originalName = fileName.replace(/\.[^/.]+$/, "");
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    term = term.toLowerCase().trim();
    
    let score = 0;
    
    // directory scoring
    if (term.startsWith('dir:')) {
        return scoreDirMatch(fileName, term.replace('dir:', ''));
    }

    // base scoring
    score = getBaseScore(nameWithoutExt, term, MAX_SCORE);
    
    if (score > 0) {
        // apply type-specific boosts
        score = applyTypeBoosts(score, term, extension);
        
        // apply penalties
        score = applyPenalties(score, fileName);
        
        // ensure score stays within bounds
        score = Math.min(MAX_SCORE, Math.max(0, score));
    }
    
    // Handle file type filters
    if (term.startsWith('filetype:')) {
        const requestedType = term.replace('filetype:', '');
        return extension === requestedType ? MAX_SCORE : 0;
    }
    
    return score;
}

function getBaseScore(name, term, MAX_SCORE) {
    const normalizedTerm = term.replace(/\s+/g, '_');
    const words = normalizedTerm.split('_');
    
    // Exact match (highest priority)
    if (name === normalizedTerm) return MAX_SCORE;
    
    // Start match (high priority)
    if (name.startsWith(normalizedTerm)) return MAX_SCORE - 1;
    
    // All words match in sequence
    const termRegex = new RegExp(words.join('.*'), 'i');
    if (termRegex.test(name)) return MAX_SCORE - 2;
    
    // All words match (any order)
    if (words.every(word => name.includes(word))) return MAX_SCORE - 3;
    
    // Most words match (>70%)
    const matchingWords = words.filter(word => name.includes(word));
    if (matchingWords.length >= Math.ceil(words.length * 0.7)) return MAX_SCORE - 4;
    
    // Single exact word match
    if (words.some(word => name.includes(word) && word.length > 2)) return MAX_SCORE - 5;
    
    return 0;
}

function applyTypeBoosts(score, term, extension) {
    // Boost exact file type matches
    if (term.startsWith('filetype:')) {
        const requestedType = term.replace('filetype:', '');
        return extension === requestedType ? score * 2 : 0;
    }

    // Apply type-specific boosts
    for (const type of Object.values(fileTypes)) {
        if (type.terms.includes(term)) {
            // Strong boost for matching both term and format
            if (type.formats.includes(extension)) {
                return score * 1.5;
            }
            // Small boost for matching just the term
            return score * 1.1;
        }
    }
    return score;
}

function applyPenalties(score, fileName) {
    if (penalties.terms.some(term => fileName.includes(term))) {
        score += penalties.penalty;
    }
    return score;
}

export async function searchFileSystem(searchTerm) {
    console.log("\n=== File System Search ===");
    console.log("Search terms:", searchTerm);
    console.log("Parsed terms:", searchTerm.toLowerCase().split(/[,|]/).map(t => t.trim()));
    
    console.log("\n=== file system search ===");
    console.log("search paths:", DEFAULT_SEARCH_PATHS);
    console.log("search terms:", searchTerm);
    
    const results = [];
    const searchPaths = process.env.SEARCH_PATHS 
        ? process.env.SEARCH_PATHS.split(',')
        : DEFAULT_SEARCH_PATHS;
    
    // validate input
    if (!searchTerm) {
        console.error('no search term provided');
        return results;
    }

    // Split by comma OR pipe to handle both formats
    const terms = searchTerm.toLowerCase().split(/[,|]/).map(t => t.trim());

    // recursive dir search
    async function searchDir(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                // Get metadata for the entry
                const metadata = await getFileMetadata(fullPath);
                if (!metadata) continue;
                
                // Separate directory and non-directory terms
                const dirTerms = terms.filter(t => t.startsWith('dir:'));
                const nonDirTerms = terms.filter(t => !t.startsWith('dir:') && !t.startsWith('time:'));
                
                if (entry.isDirectory()) {
                    // Directory handling logic...
                    if (dirTerms.length > 0) {
                        const dirScores = dirTerms
                            .map(term => scoreDirMatch(fullPath, term.replace('dir:', '')));
                        
                        const maxDirScore = Math.max(...dirScores);
                        if (maxDirScore > 0) {
                            results.push({ 
                                path: fullPath, 
                                score: maxDirScore, 
                                isDirectory: true,
                                metadata: metadata
                            });
                        }
                    }
                    
                    if (nonDirTerms.length > 0) {
                        await searchDir(fullPath);
                    }
                } else if (nonDirTerms.length > 0) {
                    // File handling logic
                    const scores = nonDirTerms.map(term => scoreMatch(entry.name, term));
                    const maxScore = Math.max(...scores);
                    if (maxScore > 0) {
                        results.push({ 
                            path: fullPath, 
                            score: maxScore, 
                            isDirectory: false, 
                            metadata: metadata 
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error searching directory ${dirPath}:`, error);
        }
    }

    // search paths
    for (const searchPath of searchPaths) {
        try {
            await searchDir(searchPath);
        } catch (error) {
            console.error(`error in path ${searchPath}:`, error);
        }
    }

    const filteredResults = results
        .filter(result => {
            // First check basic score threshold
            if (result.score <= 2) return false;
            
            const fileName = path.basename(result.path);
            
            // Handle directory searches differently
            if (result.isDirectory) {
                return true;
            }
            
            // Check file type filters
            const fileTypes = terms
                .filter(t => t.startsWith('filetype:'))
                .map(t => t.replace('filetype:', ''));
                
            if (fileTypes.length > 0) {
                const extension = fileName.split('.').pop()?.toLowerCase() || '';
                if (!fileTypes.includes(extension)) {
                    return false;
                }
            }
            
            // Check date filters AFTER other filters
            const dateFilters = terms.filter(t => 
                t.startsWith('time:') || 
                t.startsWith('date:')
            );
            
            if (dateFilters.length > 0) {
                const matchesDate = dateFilters.every(filter => 
                    matchesDateFilter(result.metadata, filter.replace(/^(time:|date:)/, ''))
                );
                if (!matchesDate) return false;
            }
            
            // Handle content terms
            const contentTerms = terms.filter(t => 
                !t.startsWith('filetype:') && 
                !t.startsWith('dir:') && 
                !t.startsWith('time:') && 
                !t.startsWith('date:')
            );
            return contentTerms.length === 0 || contentTerms.every(term => {
                const termScore = scoreMatch(fileName, term);
                return termScore > 0;
            });
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);

    return filteredResults;
}

export class ConversationManager {
    constructor(maxTokens = 4000) {
        this.history = [];
        this.maxTokens = maxTokens;
    }

    async addMessage(role, content) {
        const message = { role, content, timestamp: Date.now() };
        this.history.push(message);
        await this.truncateHistory();
    }

    async truncateHistory() {
        let totalTokens = 0;
        for (let i = this.history.length - 1; i >= 0; i--) {
            const tokens = await getTokenLength(this.history[i].content);
            totalTokens += tokens;
            if (totalTokens > this.maxTokens) {
                this.history = this.history.slice(i + 1);
                break;
            }
        }
    }

    getContext() {
        return this.history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    clear() {
        this.history = [];
    }
}