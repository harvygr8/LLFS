import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// default search paths
export const DEFAULT_SEARCH_PATHS = [
    process.cwd(),                    // current directory
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), 'Desktop')
];

function scoreMatch(fileName, term) {
    const nameWithoutExt = fileName.toLowerCase().replace(/\.[^/.]+$/, "");
    const originalName = fileName.replace(/\.[^/.]+$/, "");
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    term = term.toLowerCase().trim();
    
    const MAX_SCORE = 6;  // max possible score
    let score = 0;
    
    // check directory terms
    const isDirectoryTerm = term.startsWith('dir:');
    if (isDirectoryTerm) {
        term = term.replace('dir:', '');
        if (!fileName.includes('.')) {
            // For directories, ONLY allow exact matches or compound name matches
            if (nameWithoutExt === term || originalName === term) return MAX_SCORE;
            if (term.includes('_')) {
                const termParts = term.split('_').map(p => p.toLowerCase());
                const nameParts = originalName.split('_').map(p => p.toLowerCase());
                if (termParts.every(part => nameParts.includes(part))) return MAX_SCORE - 2;
            }
            return 0;
        }
        return 0;
    }

    // file matching logic
    const commonDocFormats = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
    const imageFormats = ['jpg', 'jpeg', 'png', 'gif'];
    
    // base scoring
    if (nameWithoutExt === term) score = MAX_SCORE;  // exact match
    else if (nameWithoutExt.startsWith(term)) score = MAX_SCORE - 1;  // start match
    else if (
        new RegExp(`\\b${term}\\b`).test(nameWithoutExt) ||  // Exact word boundary
        new RegExp(`\\b${term}_`).test(nameWithoutExt) ||     // Word with underscore
        new RegExp(`_${term}\\b`).test(nameWithoutExt) ||     // Underscore before word
        new RegExp(`\\b${term}[0-9]`).test(nameWithoutExt) || // Word with numbers
        nameWithoutExt.includes(`_${term}_`)                   // Term between underscores
    ) score = MAX_SCORE - 2;
    else if (['resume', 'cv'].includes(term) && 
        (nameWithoutExt.includes(term) || 
         nameWithoutExt.includes('curriculum') || 
         nameWithoutExt.includes('vitae'))
    ) score = MAX_SCORE - 3;
    
    // boost for file types
    if (score > 0) {
        let boost = 0;
        
        // doc-type boost
        if (['resume', 'cv', 'report', 'document', 'paper'].includes(term)) {
            if (commonDocFormats.includes(extension)) boost += 1;
        }
        // image-type boost
        else if (['photo', 'image', 'picture'].includes(term)) {
            if (imageFormats.includes(extension)) boost += 1;
        }
        
        // penalties
        if (fileName.includes('config') || 
            fileName.includes('test') || 
            fileName.includes('example') ||
            fileName.includes('temp')) {
            boost -= 1;
        }
        
        // apply boost with cap
        score = Math.min(MAX_SCORE, Math.max(0, score + boost));
    }
    
    return score;
}

export async function searchFileSystem(searchTerm) {
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

    const terms = searchTerm.toLowerCase().split('|').map(t => t.trim());

    // recursive dir search
    async function searchDir(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                // check dir terms
                const hasDirectoryTerm = terms.some(t => t.startsWith('dir:'));
                
                if (entry.isDirectory()) {
                    // process directories
                    if (hasDirectoryTerm) {
                        const maxScore = Math.max(...terms.map(term => {
                            const score = scoreMatch(entry.name, term);
                            return score >= 2 ? score * 2 : score;
                        }));
                        if (maxScore > 0) {
                            results.push({ path: fullPath, score: maxScore, isDirectory: true });
                        }
                    }
                    await searchDir(fullPath);
                } else if (!hasDirectoryTerm) {
                    // process files
                    const maxScore = Math.max(...terms.map(term => scoreMatch(entry.name, term)));
                    if (maxScore > 0) {
                        results.push({ path: fullPath, score: maxScore, isDirectory: false });
                    }
                }
            }
        } catch (error) {
            console.error(`error in ${dirPath}:`, error);
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

    // show matches
    console.log("\nraw matches found:");
    results.forEach(result => {
        console.log(`- ${result.path} (score: ${result.score})`);
    });

    const filteredResults = results
        .filter(result => {
            if (terms.some(t => t.startsWith('dir:'))) {
                return result.isDirectory ? result.score > 1 : false;
            }
            return result.score > 1;
        })
        .sort((a, b) => b.score - a.score);

    console.log(`\ntotal found: ${results.length}`);
    console.log(`after filtering: ${filteredResults.length}`);

    return filteredResults.map(result => ({
        path: result.path,
        score: result.score,
        isDirectory: result.isDirectory || false
    }));
}