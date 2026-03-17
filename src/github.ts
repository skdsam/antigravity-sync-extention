import * as https from 'https';

/**
 * Make an authenticated GitHub API request.
 */
function githubRequest(
    method: string,
    apiPath: string,
    pat: string,
    body?: object
): Promise<{ statusCode: number; data: string }> {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : '';
        const options: https.RequestOptions = {
            hostname: 'api.github.com',
            port: 443,
            path: apiPath,
            method,
            headers: {
                'Authorization': `token ${pat}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'antigravity-sync-vscode/1.0.0',
                'Content-Type': 'application/json',
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, data }));
        });

        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

/**
 * Create a private GitHub repository.
 * Returns the clone URL or throws.
 */
export async function createRepo(username: string, repoName: string, pat: string): Promise<string> {
    const { statusCode, data } = await githubRequest('POST', '/user/repos', pat, {
        name: repoName,
        private: true,
        auto_init: true,
        description: 'Antigravity settings & VS Code extension sync (managed automatically)',
    });

    if (statusCode === 201) {
        const parsed = JSON.parse(data);
        return parsed.clone_url as string;
    } else if (statusCode === 422) {
        // Repo already exists — that's fine, just fetch it
        return await getRepoCloneUrl(username, repoName, pat);
    } else {
        const parsed = JSON.parse(data);
        throw new Error(`GitHub API error ${statusCode}: ${parsed.message || data}`);
    }
}

/**
 * Get clone URL for an existing repo.
 */
export async function getRepoCloneUrl(username: string, repoName: string, pat: string): Promise<string> {
    const { statusCode, data } = await githubRequest('GET', `/repos/${username}/${repoName}`, pat);

    if (statusCode === 200) {
        const parsed = JSON.parse(data);
        return parsed.clone_url as string;
    }
    throw new Error(`Could not find repo ${username}/${repoName}: HTTP ${statusCode}`);
}

/**
 * Validate that a PAT works by calling /user.
 */
export async function validatePat(pat: string): Promise<string> {
    const { statusCode, data } = await githubRequest('GET', '/user', pat);
    if (statusCode === 200) {
        const parsed = JSON.parse(data);
        return parsed.login as string;
    }
    throw new Error(`Invalid GitHub PAT (HTTP ${statusCode}). Check your token and try again.`);
}
