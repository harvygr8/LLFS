// file type configurations
export const fileTypes = {
    document: {
        terms: ['resume', 'cv', 'report', 'paper', 'doc', 'document', 'letter', 'invoice', 'contract'],
        formats: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages', 'md', 'tex'],
        variations: {
            'resume': ['curriculum', 'vitae', 'cv'],
            'document': ['doc', 'documentation'],
            'letter': ['cover', 'recommendation']
        },
        boost: 1
    },
    spreadsheet: {
        terms: ['spreadsheet', 'excel', 'sheet', 'table', 'data'],
        formats: ['xlsx', 'xls', 'csv', 'numbers', 'ods'],
        boost: 1
    },
    presentation: {
        terms: ['presentation', 'slides', 'deck', 'powerpoint'],
        formats: ['ppt', 'pptx', 'key', 'odp'],
        boost: 1
    },
    image: {
        terms: ['photo', 'image', 'picture', 'pic', 'screenshot', 'scan'],
        formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'tiff', 'raw', 'bmp', 'heic'],
        variations: {
            'photo': ['image', 'picture', 'pic'],
            'screenshot': ['screen', 'capture']
        },
        boost: 1
    },
    video: {
        terms: ['video', 'movie', 'film', 'recording', 'clip'],
        formats: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v'],
        boost: 1
    },
    audio: {
        terms: ['audio', 'sound', 'music', 'song', 'podcast'],
        formats: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'wma'],
        boost: 1
    },
    archive: {
        terms: ['archive', 'backup', 'compressed', 'zip'],
        formats: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
        boost: 1
    },
    code: {
        terms: ['code', 'source', 'script', 'program'],
        formats: ['js', 'py', 'java', 'cpp', 'ts', 'html', 'css', 'php', 'rb', 'swift', 'go', 'rs', 'sql', 'sh', 'bat'],
        variations: {
            'javascript': ['js', 'typescript', 'ts'],
            'python': ['py', 'ipynb'],
            'shell': ['bash', 'sh', 'zsh']
        },
        boost: 1
    }
};

// penalty configurations
export const penalties = {
    terms: ['config', 'test', 'example', 'temp', 'tmp', 'cache', 'bak', 'backup'],
    penalty: -1
};
// Common search terms and configurations
export const searchTerms = {
    fileTypes: {
        document: ['resume', 'cv', 'report', 'paper', 'letter', 'invoice', 'contract'],
        media: ['photo', 'image', 'picture', 'screenshot', 'video', 'recording'],
        data: ['spreadsheet', 'table', 'database', 'chart'],
        code: ['source', 'script', 'program', 'module']
    },
    ignoreTerms: ['file', 'files', 'document', 'documents', 'named', 'called', 'find', 'search', 'looking', 'for'],
    prefixes: {
        directory: 'dir:',
        filetype: 'filetype:'
    }
};

// Scoring configurations
export const scoringConfig = {
    MAX_SCORE: 6,
    penalties: {
        terms: ['config', 'test', 'example', 'temp', 'tmp', 'cache', 'bak', 'backup'],
        penalty: -1
    }
};

// Helper functions for prompt generation
export function generateFileTypeExamples() {
    const examples = [];
    for (const [category, config] of Object.entries(fileTypes)) {
        if (config.formats && config.formats.length > 0) {
            const term = config.terms[0];
            const format = config.formats[0];
            examples.push(`"${term} files in ${format}" → ${term},filetype:${format}`);
        }
    }
    return examples.join('\n');
}

export function generateTermsDescription() {
    const terms = [];
    for (const [category, categoryTerms] of Object.entries(searchTerms.fileTypes)) {
        terms.push(`   - ${category} terms: ${categoryTerms.join(', ')}`);
    }
    return terms.join('\n');
} 