import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    getPat, savePat, clearPat, saveSettings, isInitialized, getPaths, getSettings
} from './config';
import { createRepo, validatePat } from './github';
import { cloneOrInit, pushSettings, pullSettings, installExtensions, getGitLog, log, out } from './sync';
import { SyncTreeProvider } from './treeview';

const GITHUB_TOKEN_URL =
    'https://github.com/settings/tokens/new?description=antigravity-sync&scopes=repo';

let statusBarItem: vscode.StatusBarItem;
let treeProvider: SyncTreeProvider;

// ─────────────────────────────────────────────────────────────
//  ACTIVATE
// ─────────────────────────────────────────────────────────────
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    log('Antigravity Sync extension activated.', 'INFO');

    // ── Status bar ────────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'antigravity-sync.showStatus';
    statusBarItem.tooltip = 'Antigravity Sync — click for status';
    updateStatusBar('Antigravity Sync');
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ── Sidebar tree view ─────────────────────────────────────
    treeProvider = new SyncTreeProvider();
    const treeView = vscode.window.createTreeView('antigravitySyncView', {
        treeDataProvider: treeProvider,
        showCollapseAll: false,
    });
    context.subscriptions.push(treeView);

    // ── Register commands ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-sync.initialize',
            () => cmdInitialize(context)),
        vscode.commands.registerCommand('antigravity-sync.syncNow',
            () => cmdSyncNow(context)),
        vscode.commands.registerCommand('antigravity-sync.push',
            () => cmdPush()),
        vscode.commands.registerCommand('antigravity-sync.pull',
            () => cmdPull(context)),
        vscode.commands.registerCommand('antigravity-sync.restoreExtensions',
            () => cmdRestoreExtensions()),
        vscode.commands.registerCommand('antigravity-sync.showStatus',
            () => cmdShowStatus()),
        vscode.commands.registerCommand('antigravity-sync.clearCredentials',
            () => cmdClearCredentials(context)),
        vscode.commands.registerCommand('antigravity-sync.openTokenPage',
            () => vscode.env.openExternal(vscode.Uri.parse(GITHUB_TOKEN_URL))),
        vscode.commands.registerCommand('antigravity-sync.openRepo',
            () => cmdOpenRepo()),
        vscode.commands.registerCommand('antigravity-sync.refreshView',
            () => treeProvider.refresh()),
    );

    // ── Auto-sync on startup ──────────────────────────────────
    const settings = getSettings();
    if (settings.autoSync) {
        const initialized = await isInitialized(context.secrets);
        if (initialized) {
            setTimeout(() => runAutoSync(context), 3000);
        } else {
            updateStatusBar('$(sync-ignored) Not set up', 'Run "Antigravity: Initialize Sync"');
            treeProvider.refresh();
        }
    }
}

export function deactivate(): void {
    log('Antigravity Sync deactivated.', 'INFO');
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
function updateStatusBar(text: string, tooltip?: string): void {
    statusBarItem.text = `$(sync) ${text}`;
    if (tooltip) statusBarItem.tooltip = tooltip;
}

function refreshTree(lastSyncTime?: string): void {
    treeProvider.refresh(lastSyncTime);
}

// ─────────────────────────────────────────────────────────────
//  AUTO SYNC
// ─────────────────────────────────────────────────────────────
async function runAutoSync(context: vscode.ExtensionContext): Promise<void> {
    updateStatusBar('$(sync~spin) Syncing...');
    log('Auto-sync starting...', 'INFO');
    try {
        await pullSettings();
        await pushSettings();
        const now = new Date().toLocaleTimeString();
        updateStatusBar(`$(check) Synced ${now}`, `Last synced at ${now}`);
        refreshTree(now);
        log('Auto-sync complete.', 'OK');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateStatusBar('$(warning) Sync failed', msg);
        refreshTree();
        log(`Auto-sync failed: ${msg}`, 'ERROR');
        const action = await vscode.window.showWarningMessage(
            `Antigravity Sync: Auto-sync failed. ${msg}`, 'View Log'
        );
        if (action === 'View Log') out.show();
    }
}

// ─────────────────────────────────────────────────────────────
//  COMMAND: INITIALIZE
// ─────────────────────────────────────────────────────────────
async function cmdInitialize(context: vscode.ExtensionContext): Promise<void> {
    out.show();
    log('=== INITIALIZE START ===', 'INFO');

    // Offer to open GitHub token page
    const openBrowser = await vscode.window.showInformationMessage(
        "You'll need a GitHub Personal Access Token (PAT) with the 'repo' scope.\n\n" +
        "✅ No existing repository needed — the extension creates one for you automatically.\n\n" +
        "Would you like to open GitHub to create your token now?",
        { modal: true },
        'Open GitHub (Recommended)',
        'I already have a token'
    );

    if (!openBrowser) return; // dismissed

    if (openBrowser === 'Open GitHub (Recommended)') {
        await vscode.env.openExternal(vscode.Uri.parse(GITHUB_TOKEN_URL));
        // Give user a moment to copy their token
        await new Promise(r => setTimeout(r, 1500));
    }

    // Step 1: PAT
    const pat = await vscode.window.showInputBox({
        title: 'Antigravity Sync — Enter GitHub Token',
        prompt: 'Paste your GitHub Personal Access Token (PAT) with "repo" scope',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'ghp_...',
        validateInput: v => v && v.length > 10 ? null : 'Token looks too short',
    });
    if (!pat) return;

    // Validate and auto-detect username
    updateStatusBar('$(sync~spin) Validating token...');
    let detectedUsername: string;
    try {
        detectedUsername = await validatePat(pat);
        log(`PAT valid. GitHub user: ${detectedUsername}`, 'OK');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Invalid token: ${msg}`);
        updateStatusBar('$(error) Token invalid');
        return;
    }

    // Step 2: Confirm username
    const username = await vscode.window.showInputBox({
        title: 'Antigravity Sync — Confirm Username',
        prompt: 'Your GitHub username (auto-detected from your token)',
        value: detectedUsername,
        ignoreFocusOut: true,
    });
    if (!username) return;

    // Step 3: Repo name
    const repoName = await vscode.window.showInputBox({
        title: 'Antigravity Sync — Repository Name',
        prompt: 'Name for your private sync repository (will be created automatically on GitHub)',
        value: 'antigravity-sync',
        ignoreFocusOut: true,
    });
    if (!repoName) return;

    // Create repo
    updateStatusBar('$(sync~spin) Creating GitHub repo...');
    let cloneUrl: string;
    try {
        cloneUrl = await createRepo(username, repoName, pat);
        log(`Repo ready: ${cloneUrl}`, 'OK');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to create repo: ${msg}`);
        updateStatusBar('$(error) Repo failed');
        return;
    }

    // Save settings + PAT
    await saveSettings(username, repoName);
    await savePat(context.secrets, pat);

    // Clone locally
    const paths = getPaths();
    updateStatusBar('$(sync~spin) Cloning repo...');
    try {
        cloneOrInit(cloneUrl, paths.syncRoot, pat, username);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Clone failed: ${msg}`);
        updateStatusBar('$(error) Clone failed');
        return;
    }

    // First push
    updateStatusBar('$(sync~spin) Pushing your settings...');
    try {
        await pushSettings();
        const now = new Date().toLocaleTimeString();
        updateStatusBar(`$(check) Synced ${now}`);
        refreshTree(now);
        vscode.window.showInformationMessage(
            `✅ Antigravity Sync ready! Syncing at: https://github.com/${username}/${repoName}`,
            'View Output', 'Open on GitHub'
        ).then(v => {
            if (v === 'View Output') out.show();
            if (v === 'Open on GitHub') {
                vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${username}/${repoName}`));
            }
        });
        log('=== INITIALIZE COMPLETE ===', 'OK');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Initial push failed: ${msg}`);
        updateStatusBar('$(warning) Init incomplete');
    }
}

// ─────────────────────────────────────────────────────────────
//  COMMAND: SYNC NOW (Force Sync)
// ─────────────────────────────────────────────────────────────
async function cmdSyncNow(context: vscode.ExtensionContext): Promise<void> {
    if (!(await isInitialized(context.secrets))) {
        const action = await vscode.window.showWarningMessage(
            'Antigravity Sync is not initialized yet.',
            'Initialize Now'
        );
        if (action === 'Initialize Now') cmdInitialize(context);
        return;
    }
    out.show();
    updateStatusBar('$(sync~spin) Syncing...');
    try {
        await pullSettings();
        await pushSettings();
        const now = new Date().toLocaleTimeString();
        updateStatusBar(`$(check) Synced ${now}`);
        refreshTree(now);
        vscode.window.showInformationMessage('✅ Antigravity Sync complete!');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateStatusBar('$(warning) Sync failed');
        refreshTree();
        vscode.window.showErrorMessage(`Sync failed: ${msg}`);
    }
}

// ─────────────────────────────────────────────────────────────
//  COMMAND: PUSH
// ─────────────────────────────────────────────────────────────
async function cmdPush(): Promise<void> {
    out.show();
    updateStatusBar('$(cloud-upload) Pushing...');
    try {
        await pushSettings();
        const now = new Date().toLocaleTimeString();
        updateStatusBar(`$(check) Pushed ${now}`);
        refreshTree(now);
        vscode.window.showInformationMessage('✅ Settings pushed to GitHub.');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateStatusBar('$(warning) Push failed');
        vscode.window.showErrorMessage(`Push failed: ${msg}`);
    }
}

// ─────────────────────────────────────────────────────────────
//  COMMAND: PULL
// ─────────────────────────────────────────────────────────────
async function cmdPull(context: vscode.ExtensionContext): Promise<void> {
    out.show();
    updateStatusBar('$(cloud-download) Pulling...');
    try {
        await pullSettings();
        const now = new Date().toLocaleTimeString();
        updateStatusBar(`$(check) Pulled ${now}`);
        refreshTree(now);
        vscode.window.showInformationMessage('✅ Settings pulled from GitHub.');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateStatusBar('$(warning) Pull failed');
        vscode.window.showErrorMessage(`Pull failed: ${msg}`);
    }
}

// ─────────────────────────────────────────────────────────────
//  COMMAND: RESTORE EXTENSIONS
// ─────────────────────────────────────────────────────────────
async function cmdRestoreExtensions(): Promise<void> {
    const paths = getPaths();
    if (!fs.existsSync(paths.repoExtensions)) {
        vscode.window.showWarningMessage(
            'No extensions.txt found. Run Sync Now or Pull Settings first.'
        );
        return;
    }

    const confirm = await vscode.window.showInformationMessage(
        'This will install all extensions from your synced list. Continue?',
        { modal: true },
        'Install'
    );
    if (confirm !== 'Install') return;

    out.show();
    updateStatusBar('$(extensions) Installing...');
    try {
        const result = await installExtensions(paths.repoExtensions);
        updateStatusBar('$(check) Extensions restored');
        refreshTree();
        vscode.window.showInformationMessage(
            `Extensions: ✅ ${result.installed} installed, ⏭ ${result.skipped} already present, ❌ ${result.failed} failed.`,
            'View Log'
        ).then(v => v === 'View Log' && out.show());
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateStatusBar('$(warning) Restore failed');
        vscode.window.showErrorMessage(`Restore failed: ${msg}`);
    }
}

// ─────────────────────────────────────────────────────────────
//  COMMAND: SHOW STATUS
// ─────────────────────────────────────────────────────────────
async function cmdShowStatus(): Promise<void> {
    const settings = getSettings();
    const paths = getPaths();
    const initialized = fs.existsSync(path.join(paths.syncRoot, '.git'));
    const gitLog = getGitLog();
    const repoUrl = settings.githubUsername
        ? `https://github.com/${settings.githubUsername}/${settings.repoName}`
        : '(not initialized)';

    out.clear();
    out.appendLine('═══════════════════════════════════════');
    out.appendLine('  Antigravity Sync — Status');
    out.appendLine('═══════════════════════════════════════');
    out.appendLine(`  GitHub User  : ${settings.githubUsername || '(not set)'}`);
    out.appendLine(`  Repository   : ${repoUrl}`);
    out.appendLine(`  Local Path   : ${paths.syncRoot}`);
    out.appendLine(`  Auto-Sync    : ${settings.autoSync ? 'Enabled' : 'Disabled'}`);
    out.appendLine(`  Sync Skills  : ${settings.syncSkills ? 'Yes' : 'No'}`);
    out.appendLine(`  Initialized  : ${initialized ? '✅ Yes' : '❌ No'}`);
    out.appendLine('');
    out.appendLine('  Last 10 commits:');
    gitLog.split('\n').forEach(l => out.appendLine(`    ${l}`));
    out.appendLine('═══════════════════════════════════════');
    out.show();
}

// ─────────────────────────────────────────────────────────────
//  COMMAND: OPEN REPO ON GITHUB
// ─────────────────────────────────────────────────────────────
async function cmdOpenRepo(): Promise<void> {
    const settings = getSettings();
    if (!settings.githubUsername) {
        vscode.window.showWarningMessage('Not initialized. Run "Antigravity: Initialize Sync" first.');
        return;
    }
    const url = `https://github.com/${settings.githubUsername}/${settings.repoName}`;
    vscode.env.openExternal(vscode.Uri.parse(url));
}

// ─────────────────────────────────────────────────────────────
//  COMMAND: CLEAR CREDENTIALS
// ─────────────────────────────────────────────────────────────
async function cmdClearCredentials(context: vscode.ExtensionContext): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        'This will delete your stored GitHub PAT. You will need to re-run Initialize Sync.',
        { modal: true },
        'Clear'
    );
    if (confirm !== 'Clear') return;
    await clearPat(context.secrets);
    updateStatusBar('$(sync-ignored) Credentials cleared');
    refreshTree();
    vscode.window.showInformationMessage(
        'Credentials cleared. Run "Antigravity: Initialize Sync" to set up again.'
    );
}
