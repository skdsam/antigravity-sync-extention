import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { getPaths, getSettings } from './config';

export const out = vscode.window.createOutputChannel('Antigravity Sync');

// ─────────────────────────────────────────────────────────────
//  LOGGING
// ─────────────────────────────────────────────────────────────
export function log(msg: string, level: 'INFO' | 'OK' | 'WARN' | 'ERROR' = 'INFO'): void {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `${ts} [${level}] ${msg}`;
    out.appendLine(line);
    const paths = getPaths();
    try {
        if (fs.existsSync(paths.syncRoot)) {
            fs.appendFileSync(paths.syncLog, line + '\n', 'utf8');
        }
    } catch { /* ignore log write failures */ }
}

// ─────────────────────────────────────────────────────────────
//  GIT HELPERS
// ─────────────────────────────────────────────────────────────
function git(args: string[], cwd: string): { stdout: string; stderr: string; code: number } {
    const result = cp.spawnSync('git', args, {
        cwd,
        encoding: 'utf8',
        timeout: 120_000, // 2 minute timeout
    });
    return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        code: result.status ?? 1,
    };
}

function gitOrThrow(args: string[], cwd: string, errMsg?: string): string {
    const r = git(args, cwd);
    if (r.code !== 0) {
        const msg = errMsg ?? `git ${args[0]} failed`;
        throw new Error(`${msg}\n${r.stderr.trim()}`);
    }
    return r.stdout.trim();
}

// ─────────────────────────────────────────────────────────────
//  DIRECTORY SYNC (mirror copy)
// ─────────────────────────────────────────────────────────────
function syncDir(src: string, dest: string): void {
    if (!fs.existsSync(src)) {
        log(`Source dir not found, skipping: ${src}`, 'WARN');
        return;
    }
    fs.mkdirSync(dest, { recursive: true });
    mirrorCopy(src, dest);
}

function mirrorCopy(src: string, dest: string): void {
    // Large binary extensions to skip in global_skills
    const skipExtensions = new Set(['.blend', '.blend1', '.mp4', '.mov', '.avi', '.exe', '.msi']);

    try {
        // Use recursive cpSync for robustness (Node.js 16.7+)
        fs.cpSync(src, dest, {
            recursive: true,
            force: true,
            dereference: true,
            filter: (srcPath) => {
                const stat = fs.lstatSync(srcPath);
                if (stat.isDirectory()) return true;
                const ext = path.extname(srcPath).toLowerCase();
                return !skipExtensions.has(ext);
            }
        });

        // Mirror cleanup: Remove files from dest that no longer exist in src
        const srcEntries = new Set(fs.readdirSync(src));
        if (fs.existsSync(dest)) {
            const destEntries = fs.readdirSync(dest);
            for (const name of destEntries) {
                if (!srcEntries.has(name)) {
                    const stalePath = path.join(dest, name);
                    fs.rmSync(stalePath, { recursive: true, force: true });
                }
            }
        }
    } catch (err: any) {
        log(`Sync failed for ${src}: ${err.message}`, 'ERROR');
        throw err;
    }
}

function copyFileIfExists(src: string, dest: string): boolean {
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
}

// ─────────────────────────────────────────────────────────────
//  WRITE REPO BOILERPLATE
// ─────────────────────────────────────────────────────────────
function writeGitignore(syncRoot: string): void {
    const content = [
        '# Local-only files — never commit',
        'sync.log',
        '',
        '# Large binary assets from global_skills',
        'antigravity/global_skills/**/*.blend',
        'antigravity/global_skills/**/*.blend1',
        'antigravity/global_skills/**/*.mp4',
        'antigravity/global_skills/**/*.mov',
        'antigravity/global_skills/**/*.exe',
        'antigravity/global_skills/**/*.png',
        'antigravity/global_skills/**/*.jpg',
        'antigravity/global_skills/**/*.zip',
    ].join('\n');
    fs.writeFileSync(path.join(syncRoot, '.gitignore'), content, 'utf8');
}

function writeReadme(syncRoot: string): void {
    const content = `# Antigravity Sync\n\n> Managed automatically by the Antigravity Sync VS Code extension.\n> Do not edit files in this repository manually.\n\n## Contents\n\n| Folder | Description |\n|---|---|\n| \`antigravity/\` | MCP server config + global skills |\n| \`vscode/\` | VS Code settings, keybindings, snippets, extension list |\n`;
    fs.writeFileSync(path.join(syncRoot, 'README.md'), content, 'utf8');
}

// ─────────────────────────────────────────────────────────────
//  EXTENSION LIST
// ─────────────────────────────────────────────────────────────
function exportExtensionList(destFile: string): void {
    const result = cp.spawnSync('code', ['--list-extensions'], {
        encoding: 'utf8',
        timeout: 30_000,
        shell: true,
    });
    if (result.status === 0 && result.stdout) {
        const sorted = result.stdout.trim().split('\n').filter(Boolean).sort().join('\n');
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.writeFileSync(destFile, sorted + '\n', 'utf8');
        log(`Exported ${result.stdout.trim().split('\n').length} extensions.`, 'OK');
    } else {
        log(`Could not export extension list: ${result.stderr}`, 'WARN');
    }
}

// ─────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Clone or re-connect the sync repo.
 * Called during Init.
 */
export function cloneOrInit(remoteUrl: string, syncRoot: string, pat: string, username: string): void {
    // Embed PAT in URL for authentication (git stores it via credential helper)
    const authUrl = remoteUrl.replace('https://', `https://${username}:${pat}@`);

    if (fs.existsSync(path.join(syncRoot, '.git'))) {
        log('Sync repo already cloned, updating remote URL...', 'INFO');
        git(['remote', 'set-url', 'origin', authUrl], syncRoot);
    } else {
        log(`Cloning sync repo to ${syncRoot}...`, 'INFO');
        if (fs.existsSync(syncRoot)) {
            fs.rmSync(syncRoot, { recursive: true, force: true });
        }
        const cloneResult = git(['clone', authUrl, syncRoot], path.dirname(syncRoot));
        if (cloneResult.code !== 0) {
            throw new Error(`Failed to clone repo: ${cloneResult.stderr}`);
        }
    }

    writeGitignore(syncRoot);
    writeReadme(syncRoot);

    // Set user identity for commits
    git(['config', 'user.email', `${username}@antigravity-sync`], syncRoot);
    git(['config', 'user.name', 'Antigravity Sync'], syncRoot);
}

/**
 * Push local settings to GitHub.
 */
export async function pushSettings(): Promise<void> {
    const paths = getPaths();
    const settings = getSettings();
    const { syncRoot } = paths;

    if (!fs.existsSync(path.join(syncRoot, '.git'))) {
        throw new Error('Sync not initialized. Run "Antigravity: Initialize Sync" first.');
    }

    log('=== PUSH START ===', 'INFO');

    // Antigravity
    fs.mkdirSync(paths.repoAntigravity, { recursive: true });
    log('Copying mcp_config.json...', 'INFO');
    copyFileIfExists(paths.mcpConfig, path.join(paths.repoAntigravity, 'mcp_config.json'));

    if (settings.syncSkills !== false) {
        log('Syncing global_skills/ (may take a moment on first run)...', 'INFO');
        syncDir(paths.globalSkills, paths.repoSkills);
    }

    // VS Code
    fs.mkdirSync(paths.repoVSCode, { recursive: true });
    log('Copying VS Code settings.json...', 'INFO');
    copyFileIfExists(paths.vscodeSettings, path.join(paths.repoVSCode, 'settings.json'));

    log('Copying VS Code keybindings.json...', 'INFO');
    copyFileIfExists(paths.vscodeKeybindings, path.join(paths.repoVSCode, 'keybindings.json'));

    log('Syncing VS Code snippets/...', 'INFO');
    syncDir(paths.vscodeSnippets, path.join(paths.repoVSCode, 'snippets'));

    log('Copying VS Code mcp.json...', 'INFO');
    copyFileIfExists(paths.vscodeMcpJson, path.join(paths.repoVSCode, 'mcp.json'));

    log('Copying VS Code chatLanguageModels.json...', 'INFO');
    copyFileIfExists(paths.vscodeChatModels, path.join(paths.repoVSCode, 'chatLanguageModels.json'));

    log('Syncing Roo Code storage (may take a moment)...', 'INFO');
    syncDir(paths.rooCodeStorage, paths.repoRooCode);

    log('Exporting VS Code extension list...', 'INFO');
    exportExtensionList(paths.repoExtensions);
    
    log('Directory sync and exports complete.', 'OK');

    // Git commit + push
    const hostname = require('os').hostname();
    const commitMsg = `Sync from ${hostname} at ${new Date().toISOString().substring(0, 16).replace('T', ' ')}`;
    log(`Committing: ${commitMsg}`, 'INFO');

    gitOrThrow(['add', '-A'], syncRoot);
    const status = git(['status', '--porcelain'], syncRoot);

    if (status.stdout.trim()) {
        gitOrThrow(['commit', '-m', commitMsg], syncRoot);
        gitOrThrow(['push', 'origin', 'HEAD'], syncRoot, 'Push to GitHub failed');
        log('=== PUSH COMPLETE ===', 'OK');
    } else {
        log('Nothing to commit — settings unchanged.', 'INFO');
    }
}

/**
 * Pull settings from GitHub and apply locally.
 */
export async function pullSettings(): Promise<void> {
    const paths = getPaths();
    const { syncRoot } = paths;

    if (!fs.existsSync(path.join(syncRoot, '.git'))) {
        throw new Error('Sync not initialized. Run "Antigravity: Initialize Sync" first.');
    }

    log('=== PULL START ===', 'INFO');

    // Hash extensions before pull to detect changes
    let extHashBefore = '';
    if (fs.existsSync(paths.repoExtensions)) {
        extHashBefore = require('crypto')
            .createHash('md5')
            .update(fs.readFileSync(paths.repoExtensions))
            .digest('hex');
    }

    // Check if remote is empty before pulling
    const remoteInfo = git(['ls-remote', 'origin', 'HEAD'], syncRoot);
    if (!remoteInfo.stdout.includes('HEAD')) {
        log('Remote repository is empty or has no HEAD. Skipping pull.', 'WARN');
    } else {
        try {
            gitOrThrow(['pull', '--rebase', 'origin', 'HEAD'], syncRoot, 'Pull from GitHub failed');
        } catch (err: any) {
            // Re-check if it's the "couldn't find remote ref HEAD" specifically
            if (err.message.includes("couldn't find remote ref HEAD") || err.message.includes("Couldn't find remote ref HEAD")) {
                log('Remote HEAD not found during pull. Skipping.', 'WARN');
            } else {
                throw err;
            }
        }
    }

    // Restore Antigravity files
    const repoMcp = path.join(paths.repoAntigravity, 'mcp_config.json');
    if (fs.existsSync(repoMcp)) {
        log('Restoring mcp_config.json...', 'INFO');
        copyFileIfExists(repoMcp, paths.mcpConfig);
    }

    if (fs.existsSync(paths.repoSkills)) {
        log('Restoring global_skills/...', 'INFO');
        syncDir(paths.repoSkills, paths.globalSkills);
    }

    // Restore VS Code files
    log('Restoring VS Code settings.json...', 'INFO');
    copyFileIfExists(path.join(paths.repoVSCode, 'settings.json'), paths.vscodeSettings);

    log('Restoring VS Code keybindings.json...', 'INFO');
    copyFileIfExists(path.join(paths.repoVSCode, 'keybindings.json'), paths.vscodeKeybindings);

    log('Restoring VS Code snippets/...', 'INFO');
    syncDir(path.join(paths.repoVSCode, 'snippets'), paths.vscodeSnippets);

    if (fs.existsSync(path.join(paths.repoVSCode, 'mcp.json'))) {
        log('Restoring mcp.json...', 'INFO');
        copyFileIfExists(path.join(paths.repoVSCode, 'mcp.json'), paths.vscodeMcpJson);
    }

    if (fs.existsSync(path.join(paths.repoVSCode, 'chatLanguageModels.json'))) {
        log('Restoring chatLanguageModels.json...', 'INFO');
        copyFileIfExists(path.join(paths.repoVSCode, 'chatLanguageModels.json'), paths.vscodeChatModels);
    }

    if (fs.existsSync(paths.repoRooCode)) {
        log('Restoring Roo Code storage...', 'INFO');
        syncDir(paths.repoRooCode, paths.rooCodeStorage);
    }

    // Restore extensions only if list changed
    if (fs.existsSync(paths.repoExtensions)) {
        const extHashAfter = require('crypto')
            .createHash('md5')
            .update(fs.readFileSync(paths.repoExtensions))
            .digest('hex');

        if (extHashAfter !== extHashBefore) {
            log('Extension list changed — installing new extensions...', 'WARN');
            await installExtensions(paths.repoExtensions);
        } else {
            log('Extension list unchanged — skipping reinstall.', 'INFO');
        }
    }

    log('=== PULL COMPLETE ===', 'OK');
}

/**
 * Install all extensions from a saved extensions.txt file.
 */
export async function installExtensions(extFile: string): Promise<{ installed: number; skipped: number; failed: number }> {
    if (!fs.existsSync(extFile)) {
        throw new Error(`extensions.txt not found at: ${extFile}`);
    }

    const desired = fs.readFileSync(extFile, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    // Get currently installed
    const currentResult = cp.spawnSync('code', ['--list-extensions'], {
        encoding: 'utf8', timeout: 30_000, shell: true,
    });
    const current = new Set(
        (currentResult.stdout || '').split('\n').map(l => l.trim().toLowerCase()).filter(Boolean)
    );

    let installed = 0, skipped = 0, failed = 0;

    for (const ext of desired) {
        if (current.has(ext.toLowerCase())) {
            skipped++;
            continue;
        }
        log(`Installing extension: ${ext}`, 'INFO');
        const r = cp.spawnSync('code', ['--install-extension', ext, '--force'], {
            encoding: 'utf8', timeout: 60_000, shell: true,
        });
        if (r.status === 0) {
            log(`  ✅ ${ext}`, 'OK');
            installed++;
        } else {
            log(`  ❌ ${ext}: ${r.stderr}`, 'ERROR');
            failed++;
        }
    }

    return { installed, skipped, failed };
}

/**
 * Get last 10 git commits from the sync repo as a string.
 */
export function getGitLog(): string {
    const { syncRoot } = getPaths();
    if (!fs.existsSync(path.join(syncRoot, '.git'))) return '(not initialized)';
    const r = git(['log', '--oneline', '-10'], syncRoot);
    return r.stdout.trim() || '(no commits yet)';
}
