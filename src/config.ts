import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

const SECRET_GITHUB_PAT = 'antigravity-sync.githubPat';

export interface SyncConfig {
    githubUsername: string;
    repoName: string;
    autoSync: boolean;
    syncSkills: boolean;
    remoteUrl: string;
    syncRepoPath: string;
}

/**
 * Read extension settings from VS Code configuration.
 */
export function getSettings(): Partial<SyncConfig> {
    const cfg = vscode.workspace.getConfiguration('antigravitySync');
    return {
        githubUsername: cfg.get<string>('githubUsername', ''),
        repoName: cfg.get<string>('repoName', 'antigravity-sync'),
        autoSync: cfg.get<boolean>('autoSync', true),
        syncSkills: cfg.get<boolean>('syncSkills', true),
        syncRepoPath: path.join(os.homedir(), '.antigravity-sync'),
    };
}

/**
 * Build SyncConfig; throws if not initialized.
 */
export function getSyncConfig(secrets?: vscode.SecretStorage): Partial<SyncConfig> {
    const settings = getSettings();
    if (settings.githubUsername) {
        settings.remoteUrl = `https://github.com/${settings.githubUsername}/${settings.repoName}.git`;
    }
    return settings;
}

/**
 * Save GitHub username and repo name to VS Code settings.
 */
export async function saveSettings(username: string, repoName: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('antigravitySync');
    await cfg.update('githubUsername', username, vscode.ConfigurationTarget.Global);
    await cfg.update('repoName', repoName, vscode.ConfigurationTarget.Global);
}

/**
 * Store the GitHub PAT in VS Code SecretStorage (encrypted, per-machine).
 */
export async function savePat(secrets: vscode.SecretStorage, pat: string): Promise<void> {
    await secrets.store(SECRET_GITHUB_PAT, pat);
}

/**
 * Retrieve the GitHub PAT from VS Code SecretStorage.
 */
export async function getPat(secrets: vscode.SecretStorage): Promise<string | undefined> {
    return secrets.get(SECRET_GITHUB_PAT);
}

/**
 * Delete the stored PAT from SecretStorage.
 */
export async function clearPat(secrets: vscode.SecretStorage): Promise<void> {
    await secrets.delete(SECRET_GITHUB_PAT);
}

/**
 * Check if the extension has been initialized (has username + PAT).
 */
export async function isInitialized(secrets: vscode.SecretStorage): Promise<boolean> {
    const settings = getSettings();
    if (!settings.githubUsername) return false;
    const pat = await getPat(secrets);
    return !!pat;
}

/**
 * Well-known local paths on this machine.
 */
export function getPaths() {
    const home = os.homedir();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const syncRoot = path.join(home, '.antigravity-sync');
    return {
        syncRoot,
        antigravityRoot: path.join(home, '.gemini', 'antigravity'),
        mcpConfig: path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
        globalSkills: path.join(home, '.gemini', 'antigravity', 'global_skills'),
        vscodeUserDir: path.join(appData, 'Code', 'User'),
        vscodeSettings: path.join(appData, 'Code', 'User', 'settings.json'),
        vscodeKeybindings: path.join(appData, 'Code', 'User', 'keybindings.json'),
        vscodeSnippets: path.join(appData, 'Code', 'User', 'snippets'),
        vscodeMcpJson: path.join(appData, 'Code', 'User', 'mcp.json'),
        vscodeChatModels: path.join(appData, 'Code', 'User', 'chatLanguageModels.json'),
        rooCodeStorage: path.join(appData, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-code'),
        // Staging paths inside sync repo
        repoAntigravity: path.join(syncRoot, 'antigravity'),
        repoSkills: path.join(syncRoot, 'antigravity', 'global_skills'),
        repoVSCode: path.join(syncRoot, 'vscode'),
        repoRooCode: path.join(syncRoot, 'vscode', 'roo-code'),
        repoExtensions: path.join(syncRoot, 'vscode', 'extensions.txt'),
        syncLog: path.join(syncRoot, 'sync.log'),
    };
}
