import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

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
 * Detect the editor context (VS Code vs Antigravity etc.)
 * Returns the AppData folder name and the CLI command.
 */
export function getEditorDetails() {
    const appName = vscode.env.appName || 'Code';
    let dataFolderName = 'Code';
    let cliCmd = 'code';

    if (appName.toLowerCase().includes('antigravity ide')) {
        dataFolderName = 'Antigravity IDE';
        cliCmd = process.platform === 'win32' ? 'antigravity-ide.cmd' : 'antigravity-ide';
    } else if (appName.toLowerCase().includes('antigravity')) {
        dataFolderName = 'Antigravity';
        cliCmd = process.platform === 'win32' ? 'antigravity.cmd' : 'antigravity';
    } else if (appName.toLowerCase().includes('insider')) {
        dataFolderName = 'Code - Insiders';
        cliCmd = process.platform === 'win32' ? 'code-insiders.cmd' : 'code-insiders';
    } else if (appName.toLowerCase().includes('cursor')) {
        dataFolderName = 'Cursor';
        cliCmd = process.platform === 'win32' ? 'cursor.cmd' : 'cursor';
    } else if (appName.toLowerCase().includes('windsurf')) {
        dataFolderName = 'Windsurf';
        cliCmd = process.platform === 'win32' ? 'windsurf.cmd' : 'windsurf';
    } else {
        cliCmd = process.platform === 'win32' ? 'code.cmd' : 'code';
    }

    const cfg = vscode.workspace.getConfiguration('antigravitySync');
    const overrideCmd = cfg.get<string>('cliCommand');
    if (overrideCmd && overrideCmd.trim() !== '') {
        cliCmd = overrideCmd.trim();
    }

    const overrideDir = cfg.get<string>('dataFolderName');
    if (overrideDir && overrideDir.trim() !== '') {
        dataFolderName = overrideDir.trim();
    }

    return { dataFolderName, cliCmd };
}

/**
 * Detect the actual extensions directory in use.
 */
export function getExtensionsDir(): string {
    const home = os.homedir();

    // 1. Try to find the active extension directory from our own extension path
    const self = vscode.extensions.getExtension('antigravity.antigravity-sync');
    if (self && self.extensionPath) {
        const parent = path.dirname(self.extensionPath);
        if (parent.toLowerCase().endsWith('extensions')) {
            return parent;
        }
    }

    // 2. Try to find any active non-builtin extension's path
    for (const ext of vscode.extensions.all) {
        if (ext.packageJSON && ext.packageJSON.isBuiltin === false) {
            const parent = path.dirname(ext.extensionPath);
            if (parent.toLowerCase().endsWith('extensions')) {
                return parent;
            }
        }
    }

    // 3. Fallback based on editor appName
    const appName = vscode.env.appName || 'Code';
    if (appName.toLowerCase().includes('antigravity ide')) {
        const ideDir = path.join(home, '.antigravity-ide', 'extensions');
        if (fs.existsSync(ideDir)) {
            return ideDir;
        }
        return path.join(home, '.antigravity', 'extensions');
    } else if (appName.toLowerCase().includes('antigravity')) {
        return path.join(home, '.antigravity', 'extensions');
    } else if (appName.toLowerCase().includes('insider')) {
        return path.join(home, '.vscode-insiders', 'extensions');
    } else if (appName.toLowerCase().includes('cursor')) {
        return path.join(home, '.cursor', 'extensions');
    } else if (appName.toLowerCase().includes('windsurf')) {
        return path.join(home, '.windsurf', 'extensions');
    }
    return path.join(home, '.vscode', 'extensions');
}

/**
 * Well-known local paths on this machine.
 */
export function getPaths() {
    const home = os.homedir();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const syncRoot = path.join(home, '.antigravity-sync');
    const { dataFolderName } = getEditorDetails();
    return {
        syncRoot,
        antigravityRoot: path.join(home, '.gemini', 'antigravity'),
        mcpConfig: path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
        globalSkills: path.join(home, '.gemini', 'antigravity', 'global_skills'),
        vscodeUserDir: path.join(appData, dataFolderName, 'User'),
        vscodeSettings: path.join(appData, dataFolderName, 'User', 'settings.json'),
        vscodeKeybindings: path.join(appData, dataFolderName, 'User', 'keybindings.json'),
        vscodeSnippets: path.join(appData, dataFolderName, 'User', 'snippets'),
        vscodeMcpJson: path.join(appData, dataFolderName, 'User', 'mcp.json'),
        vscodeChatModels: path.join(appData, dataFolderName, 'User', 'chatLanguageModels.json'),
        rooCodeStorage: path.join(appData, dataFolderName, 'User', 'globalStorage', 'rooveterinaryinc.roo-code'),
        // Extensions path
        extensionsDir: getExtensionsDir(),
        // Staging paths inside sync repo
        repoAntigravity: path.join(syncRoot, 'antigravity'),
        repoSkills: path.join(syncRoot, 'antigravity', 'global_skills'),
        repoVSCode: path.join(syncRoot, 'vscode'),
        repoRooCode: path.join(syncRoot, 'vscode', 'roo-code'),
        repoExtensions: path.join(syncRoot, 'vscode', 'extensions.txt'),
        syncLog: path.join(syncRoot, 'sync.log'),
    };
}
