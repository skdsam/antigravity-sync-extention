import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getPaths, getSettings } from './config';
import { getGitLog } from './sync';

// ─────────────────────────────────────────────────────────────
//  TREE ITEM TYPES
// ─────────────────────────────────────────────────────────────
export type TreeItemKind =
    | 'action'
    | 'status'
    | 'section'
    | 'info';

export class SyncTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly kind: TreeItemKind,
        collapsible = vscode.TreeItemCollapsibleState.None,
        command?: vscode.Command,
        icon?: vscode.ThemeIcon,
        public readonly description?: string,
        tooltip?: string,
    ) {
        super(label, collapsible);
        this.command   = command;
        this.iconPath  = icon;
        this.tooltip   = tooltip ?? label;
        if (description) this.description = description;
        // Highlight action items
        if (kind === 'action') {
            this.contextValue = 'action';
        }
    }
}

// ─────────────────────────────────────────────────────────────
//  TREE DATA PROVIDER
// ─────────────────────────────────────────────────────────────
export class SyncTreeProvider implements vscode.TreeDataProvider<SyncTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SyncTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private lastSyncTime: string = 'Never';
    private syncStatus: string = 'Idle';
    private isInitialized: boolean = false;

    getTreeItem(element: SyncTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SyncTreeItem): SyncTreeItem[] {
        if (element) return []; // flat list, no nested children

        const paths = getPaths();
        const settings = getSettings();
        this.isInitialized = fs.existsSync(path.join(paths.syncRoot, '.git'));

        if (!this.isInitialized) {
            return [
                new SyncTreeItem(
                    '⚠ Not initialized',
                    'status',
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    new vscode.ThemeIcon('warning'),
                    undefined,
                    'Run "Antigravity: Initialize Sync" to get started'
                ),
                new SyncTreeItem(
                    'Initialize Sync',
                    'action',
                    vscode.TreeItemCollapsibleState.None,
                    { title: 'Initialize', command: 'antigravity-sync.initialize' },
                    new vscode.ThemeIcon('play-circle'),
                ),
                new SyncTreeItem(
                    'Create GitHub Token →',
                    'action',
                    vscode.TreeItemCollapsibleState.None,
                    { title: 'Open Token Page', command: 'antigravity-sync.openTokenPage' },
                    new vscode.ThemeIcon('link-external'),
                    undefined,
                    'Opens github.com to create a Personal Access Token'
                ),
            ];
        }

        const repoUrl = settings.githubUsername
            ? `github.com/${settings.githubUsername}/${settings.repoName}`
            : 'Unknown';

        return [
            // ── Actions ──────────────────────────────────────
            new SyncTreeItem(
                'Force Sync',
                'action',
                vscode.TreeItemCollapsibleState.None,
                { title: 'Sync Now', command: 'antigravity-sync.syncNow' },
                new vscode.ThemeIcon('sync'),
                undefined,
                'Pull from GitHub then push local changes'
            ),
            new SyncTreeItem(
                'Push Settings',
                'action',
                vscode.TreeItemCollapsibleState.None,
                { title: 'Push', command: 'antigravity-sync.push' },
                new vscode.ThemeIcon('cloud-upload'),
                undefined,
                'Upload local settings to GitHub'
            ),
            new SyncTreeItem(
                'Pull Settings',
                'action',
                vscode.TreeItemCollapsibleState.None,
                { title: 'Pull', command: 'antigravity-sync.pull' },
                new vscode.ThemeIcon('cloud-download'),
                undefined,
                'Download settings from GitHub and apply locally'
            ),
            new SyncTreeItem(
                'Restore Extensions',
                'action',
                vscode.TreeItemCollapsibleState.None,
                { title: 'Restore', command: 'antigravity-sync.restoreExtensions' },
                new vscode.ThemeIcon('extensions'),
                undefined,
                'Re-install all extensions from saved list'
            ),
            // ── Status ───────────────────────────────────────
            new SyncTreeItem(
                'STATUS',
                'section',
                vscode.TreeItemCollapsibleState.None,
                undefined,
                undefined,
                undefined,
            ),
            new SyncTreeItem(
                'Last sync',
                'status',
                vscode.TreeItemCollapsibleState.None,
                undefined,
                new vscode.ThemeIcon('clock'),
                this.lastSyncTime,
                `Last sync: ${this.lastSyncTime}`
            ),
            new SyncTreeItem(
                'Repository',
                'status',
                vscode.TreeItemCollapsibleState.None,
                { title: 'Open on GitHub', command: 'antigravity-sync.openRepo' },
                new vscode.ThemeIcon('github'),
                repoUrl,
                `Open repository on GitHub: ${repoUrl}`
            ),
            new SyncTreeItem(
                'Status log',
                'action',
                vscode.TreeItemCollapsibleState.None,
                { title: 'Show Status', command: 'antigravity-sync.showStatus' },
                new vscode.ThemeIcon('output'),
                undefined,
                'View detailed sync status and commit history'
            ),
        ];
    }

    /** Call to refresh the sidebar when sync state changes */
    refresh(lastSyncTime?: string, status?: string): void {
        if (lastSyncTime) this.lastSyncTime = lastSyncTime;
        if (status) this.syncStatus = status;
        this._onDidChangeTreeData.fire();
    }
}
