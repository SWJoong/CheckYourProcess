# Install the desktop integrations

Build the repository first with Node.js 22.20.0 or later:

```powershell
npm ci
npm run build
npm run package
```

Each archive contains the bundled local runtime, so its installed copy does not need `npm install`. Node itself must still be available to the desktop host. Keep all copies on the same `CYP_DATA_DIR` and `CYP_PORT` if overriding the defaults.

The default shared data directory is `%USERPROFILE%/.checkyourprocess`. When upgrading from beta.1, update all three local integrations and restart their hosts; see [the beta.2 upgrade guide](upgrade-beta2.md). The old AppData databases are preserved and are not automatically imported. beta.3 to beta.5 use the same database as beta.2; stop the old service normally before starting the updated integrations.

## Claude Code

Use a current Claude Code version with mods support. The native `AbovePrompt` site is documented from 2.1.290; development verification targets 2.1.319. Native bands are supported in the terminal and Claude Code's Desktop surface, not the general Claude Desktop Chat tab.

1. Extract `release/checkyourprocess-claude-code-0.1.0-beta.5.zip` into a stable folder such as `plugins/checkyourprocess`.
2. For a session-scoped local test, run `claude --plugin-dir ./plugins/checkyourprocess` from your working folder. The path must point at the extracted folder containing `.claude-plugin/plugin.json`.
3. For a persistent install, add the generated `release/claude-marketplace.json` through `/plugin marketplace add` or `claude plugin marketplace add`, then install `checkyourprocess@checkyourprocess-local`. Keep its staged source directory in place, or replace the source path with your extracted stable plugin directory.
4. Review the plugin's local process, network and hook permissions. Restart the host after installation.
5. Run `/checkyourprocess:track` or click **Start tracking / 추적 시작**. The SessionStart hook supplies the native session ID; the tracking tool binds its separate tracker ID to that native session.

The band provides a details toggle, session/project scope and Korean/English language buttons. The details view pages through all tasks, connects a standalone session to an existing project, and links project tasks that this session is missing. beta.5 ships the Claude Code plugin without the in-chat card (`CYP_CARD=off` in its `.mcp.json`), so there is no full card to open; register new tasks from the chat. Other plugins sharing the same AbovePrompt site are preserved beneath this band.

Reference: [Claude mods](https://code.claude.com/docs/en/plugins/mods/reference).

## Codex

1. Extract `release/checkyourprocess-codex-0.1.0-beta.5.zip` into `plugins/checkyourprocess` inside the repository where you want to make it available.
2. Add the entry below to that repository's `.agents/plugins/marketplace.json`. If the file already exists, merge its `plugins` array rather than replacing it.

```json
{
  "name": "checkyourprocess-local",
  "interface": { "displayName": "CheckYourProcess local" },
  "plugins": [{
    "name": "checkyourprocess",
    "source": { "source": "local", "path": "./plugins/checkyourprocess" },
    "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
    "category": "Productivity"
  }]
}
```

3. Restart the desktop app, open its Plugins Directory, select **CheckYourProcess local**, and install/enable the plugin.
4. Review and trust the exact hook definitions in **Settings → Hooks** or **Review hooks**. Untrusted hooks are skipped; the card and explicit progress reports can still work.
5. In a new task, invoke the plugin's `track` skill or ask to start tracking. Call `show_progress` to display the card, then expand it to the internal side panel when the host offers that control.

The generated `release/codex-marketplace.json` is a template for the staged package. Codex resolves `source.path` relative to the marketplace root, not the `.agents/plugins/` subdirectory. A personal marketplace is also possible; see the [official packaging guide](https://developers.openai.com/plugins/build/plugins).

This plugin uses lifecycle hooks for activity only. It does not attach an unsupported fixed bar to Codex's composer, read Codex's private transcripts, or require direct access to the desktop app-server daemon.

## Claude Desktop Chat

The desktop app's **Code** tab runs Claude Code. It uses the native band described above, not the Chat MCP App. Claude shares one `AbovePrompt` area among mods; CheckYourProcess draws its own named, bordered panel with spacing in that area, even with Ponytail enabled. The surrounding area belongs to Claude and is not a separate window for each mod. See [the official band API](https://code.claude.com/docs/en/plugins/mods/interface#band-above-the-prompt).

1. Open Claude Desktop **Settings → Desktop app → Extensions → Advanced → Install Extension**. The exact label can vary with the current settings layout.
2. Select `release/checkyourprocess-claude-desktop-0.1.0-beta.5.mcpb`.
3. Enable the extension and restart Claude Desktop if requested. Verify the `checkyourprocess` tools appear in the conversation's tools/connectors menu.
4. Ask: “Start tracking this task and show its progress card.” Choose standalone, a new project, or an existing project in the card.

This is a directly installed desktop extension. It is distinct from an account-synced Claude plugin: bundled local servers in account plugins have different Chat/Cowork/Code availability. The local extension provides inline HTML; newer sidebar entry points, embedded external sites and app-side tools may require remote capabilities and are not necessary for this progress card.

Reference: [local desktop extensions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop), [MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started).

## ChatGPT with a private MCP tunnel

Use the local desktop plugin path if your ChatGPT local execution surface supports it. For ChatGPT's cloud-connected Chat surface, use the official Secure MCP Tunnel so the database can stay on the PC.

1. Confirm the ChatGPT account/workspace permits custom MCP connections and the associated Platform organization grants tunnel creation/use. A ChatGPT subscription alone does not establish those permissions.
2. Build the project. Install `tunnel-client` from the download linked by the [official Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
3. Follow `tunnel-client help quickstart` and configure a **local stdio** target whose command is `node` and whose argument is the absolute path to this installation's `dist/stdio.js`. Use the same data-directory/port environment overrides as the desktop integrations, if any.
4. Configure the runtime API key through local secure input or an environment reference. Never paste it into a chat, this repository, command arguments or a committed configuration file. Keep the tunnel's Platform organization and ChatGPT workspace associations correct.
5. Run the client's doctor/readiness check and keep the tunnel client running. The stdio bridge starts the authenticated loopback service when needed. Do not publicly expose `/api/action`, the local token, or the local service port.
6. In **ChatGPT Plugins → Add custom MCP server**, choose **Tunnel**, select its `tunnel_id`, complete the connection review, and create the personal plugin.
7. Start a new chat with the plugin enabled. Ask to start tracking and show the progress card. Confirm a safe task update changes the displayed progress.

A tunnel is a private connection mechanism, not a public marketplace submission. This project does not create a tunnel, API key or account connection automatically. The database remains local; data requested by the connected host still passes through that host.

## Connection and uninstall checks

For native-bar versus card errors and startup diagnostics, see [connection troubleshooting](troubleshooting.md).

```powershell
node dist/cli.js status
node dist/cli.js preview
node dist/cli.js stop
```

An unavailable loopback port is reported without terminating its current listener. Select a free `CYP_PORT` consistently across all host processes if needed. An unavailable service/tunnel leaves the last confirmed card value visible with a disconnected warning; resume after reconnecting.

Disable or uninstall the extension in each host to stop its integration. Stop the local service and tunnel client separately. User state is intentionally retained. Deleting `%USERPROFILE%/.checkyourprocess` is an explicit, irreversible reset and is not part of uninstall. Older AppData directories are also left untouched.

## Verification checklist

For each host, confirm: tool discovery; explicit start; a five-step plan; updates to 20% and 40%; shared-project updates from a second session; no duplicate count for a shared task; scope switching; English/Korean switching; service disconnect/reconnect; and reopening the saved tracker after a restart.

Record the actual host versions and observed outcomes. Source-level tests and manifest checks do not substitute for live account verification.
