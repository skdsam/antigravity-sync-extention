# Antigravity Sync

> Sync your **Antigravity skills**, **MCP server config**, and **VS Code settings/extensions** across all your devices automatically using a private GitHub repository.

---

## Features

- 🔄 **Auto-sync on startup** — Pulls then pushes settings silently every time VS Code opens
- 📦 **Syncs VS Code extensions** — Saves your extension list and re-installs them on any device
- 🎨 **Syncs your theme** — `settings.json` (including `workbench.colorTheme`) is always in sync
- 🧠 **Syncs Antigravity skills** — All your custom AI skills stay consistent across machines
- 🔒 **Secure** — Your GitHub token is stored in VS Code's encrypted **SecretStorage**, never in a file
- 🖱️ **Sidebar panel** — Force Sync, Push, Pull buttons always visible in the Activity Bar

---

## Installation

Since this extension is not yet on the Marketplace, you must install it manually from the `.vsix` file:

1. Download the `antigravity-sync-1.1.0.vsix` file.
2. In VS Code, open the **Extensions** view (`Ctrl+Shift+X`).
3. Click the **...** (Views and More Actions) menu in the top right.
4. Select **Install from VSIX...**
5. Select the downloaded `.vsix` file.

---

## Quick Start


### Step 1 — Get a GitHub Token

You don't need an existing repository — **the extension creates it for you** automatically.

You just need a GitHub Personal Access Token (PAT):

1. Click here or go to: **https://github.com/settings/tokens/new**
2. Give it a name: `antigravity-sync`
3. Check the **`repo`** scope *(full control of private repositories)*
4. Click **Generate token** — copy it (you won't see it again)

> VS Code will open this page automatically when you run **Initialize Sync**.

### Step 2 — Initialize (run once per device)

Open the Command Palette (`Ctrl+Shift+P`) and run:

```
Antigravity: Initialize Sync
```

You'll be prompted for:
- **Your GitHub Personal Access Token** (PAT) — the extension opens the creation page for you
- **Your GitHub username** — auto-detected from the token
- **Repository name** — defaults to `antigravity-sync` (a private repo is created automatically)

❌ **No repo URL needed** — the extension creates the private repository for you.

### Step 3 — Done!

From now on, every time VS Code opens, sync runs automatically in the background.

---

## Sidebar Panel

Click the **sync icon** in the Activity Bar (left sidebar) to open the **Antigravity Sync panel**:

| Button | Action |
|---|---|
| ↺ **Force Sync** | Pull from GitHub then push local changes |
| ↑ **Push** | Upload local settings to GitHub |
| ↓ **Pull** | Download settings from GitHub |
| ℹ **Status** | Show sync status, repo info, last commits |

---

## Commands (Command Palette)

| Command | Description |
|---|---|
| `Antigravity: Initialize Sync` | First-time setup |
| `Antigravity: Sync Now` | Force a full sync (pull + push) |
| `Antigravity: Push Settings` | Push local settings to GitHub |
| `Antigravity: Pull Settings` | Pull settings from GitHub |
| `Antigravity: Restore Extensions` | Re-install extensions from saved list |
| `Antigravity: Show Sync Status` | View repo info and last 10 commits |
| `Antigravity: Clear Saved Credentials` | Remove stored GitHub token |

---

## What Gets Synced

| Item | Details |
|---|---|
| **Antigravity MCP Config** | `~/.gemini/antigravity/mcp_config.json` |
| **Antigravity Skills** | `~/.gemini/antigravity/global_skills/` |
| **VS Code Settings** | Includes theme, font, editor preferences |
| **VS Code Keybindings** | `keybindings.json` |
| **VS Code Snippets** | All snippet files |
| **VS Code Extensions** | Saved as a list, reinstalled automatically |
| **Roo Code Settings** | Custom instructions, prompt history, and models |
| **Global Storage** | Specific extension data (e.g., `rooveterinaryinc.roo-code`) |
| **Additional Configs** | `mcp.json`, `chatLanguageModels.json` |

> **Note on extensions:** Binary VSIX files are not synced (they'd be gigabytes). Instead, the extension saves a list of your extension IDs and reinstalls them from the marketplace on any new device.

---

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `antigravitySync.githubUsername` | `""` | Your GitHub username |
| `antigravitySync.repoName` | `antigravity-sync` | Private repository name |
| `antigravitySync.autoSync` | `true` | Auto-sync when VS Code opens |
| `antigravitySync.syncSkills` | `true` | Include Antigravity skills in sync |

---

## Sync Log

View the full live sync log: **Output panel → "Antigravity Sync"**

Or open the log file directly: `~\.antigravity-sync\sync.log`

---

## Setting Up a Second Device

1. Install this extension from the `.vsix` file
2. Run **`Antigravity: Initialize Sync`** (same GitHub username + PAT + repo name)
3. Run **`Antigravity: Pull Settings`** to immediately apply your settings
4. Done — future syncs happen automatically on startup

---

## Requirements

- VS Code 1.85+
- Git installed and in your PATH
- GitHub account with a PAT (`repo` scope)

---

## Privacy & Security

- Your GitHub token is **never** written to disk — it's stored in VS Code's built-in SecretStorage (Windows Credential Manager under the hood)
- The sync repository is **private by default**
- No telemetry, no external services beyond GitHub

---

*Built with the Antigravity AI coding assistant.*
