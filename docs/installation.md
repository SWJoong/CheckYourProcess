# 설치 안내 / Install the integrations

## 먼저 준비하기

Windows와 Node.js **22.20.0 이상**이 필요합니다. 소스 클론에는 Git도 사용합니다. Node 설치 후 터미널·대상 앱을 완전히 다시 열고 다음 명령을 확인하세요.

```powershell
node --version
npm --version
```

## 릴리스 패키지로 설치하기

[v0.1.0-beta.5 릴리스](https://github.com/SWJoong/CheckYourProcess/releases/tag/v0.1.0-beta.5)의 **Assets**에서 사용할 플랫폼의 ZIP 또는 `.mcpb`를 내려받으세요. ZIP은 안정된 폴더에 압축을 풀고, `.mcpb`는 아래 Claude Desktop 설정에서 설치합니다. 이 경로에는 Git·`npm ci`·소스 빌드가 필요하지 않으며 Node.js는 필요합니다.

아래 안내의 `release/checkyourprocess-…` 파일명은 내려받은 같은 이름의 파일로 대신하면 됩니다. 파일 이름에 **Source code**가 붙은 자동 생성 ZIP은 설치 패키지가 아닙니다. Codex CLI나 ChatGPT 터널을 설정할 때는 압축을 푼 패키지 폴더의 `dist/stdio.js`를 사용합니다.

## 소스에서 빌드하기

직접 개발하거나 로컬 마켓플레이스 파일을 만들려면 소스를 빌드합니다. `release/`는 Git에 포함되지 않는 생성 폴더입니다. 소스 ZIP을 사용했다면 압축을 푼 뒤 `package.json`이 있는 폴더에서 아래의 `npm ci`부터 실행하세요.

```powershell
git clone https://github.com/SWJoong/CheckYourProcess.git
cd CheckYourProcess
npm ci
npm run package
```

각 명령이 성공한 뒤 다음 명령을 실행하세요. `npm run package`는 빌드와 세 설치 파일 생성을 함께 수행합니다. `npm.ps1` 실행 정책 오류가 나면 같은 명령을 `npm.cmd ci`, `npm.cmd run package`로 실행할 수 있습니다. `node`를 찾을 수 없다면 Node 설치·PATH와 앱 재시작을 확인하세요.

사용할 플랫폼 하나만 선택하면 됩니다. 세부 안내: [Claude Code](#claude-code) · [Codex CLI](#codex-cli) · [Codex 앱](#codex-desktop-app) · [Claude Desktop Chat](#claude-desktop-chat) · [ChatGPT](#chatgpt-with-a-private-mcp-tunnel).

설치 후에는 새 대화에서 추적을 시작하고 세 작업을 등록해 `0/3 → 1/3 (33%)` 갱신을 확인하세요. 마지막으로 앱을 다시 열고 기존 추적 ID를 명시적으로 재개해 저장 상태가 유지되는지 확인합니다. [베타 확인 항목](beta.md)의 기본 동작이 통과한 다음 추가 기능을 시험합니다.

## Common runtime and updates

Each archive contains the bundled local runtime, so its installed copy does not need `npm install`. Node itself must still be available to the desktop host. Keep all copies on the same `CYP_DATA_DIR` and `CYP_PORT` if overriding the defaults.

The default shared data directory is `%USERPROFILE%/.checkyourprocess`. When upgrading from beta.1, update all three local integrations and restart their hosts; see [the beta.2 upgrade guide](upgrade-beta2.md). The old AppData databases are preserved and are not automatically imported. beta.3 to beta.5 use the same database as beta.2; stop the old service normally before starting the updated integrations.

## Claude Code

Use a Claude Code version with mods support. The native `AbovePrompt` site is documented from 2.1.290; native band tests were run with **2.1.322 and 2.1.323**. Native bands are supported in the terminal and Claude Code's Desktop surface, not the general Claude Desktop Chat tab.

1. Extract `release/checkyourprocess-claude-code-0.1.0-beta.5.zip` into a stable folder such as `plugins/checkyourprocess`.
2. For a session-scoped local test, run `claude --plugin-dir ./plugins/checkyourprocess` from your working folder. The path must point at the extracted folder containing `.claude-plugin/plugin.json`.
3. For a persistent install, register a local marketplace **folder** with `claude plugin marketplace add`, then install `checkyourprocess@checkyourprocess-local`. A source build generates `release/.claude-plugin/marketplace.json`; for the release ZIP, create that file yourself next to the extracted folder, as shown below. Pass the folder, not the JSON file.
4. Review the plugin's local process, network and hook permissions. Restart the host after installation.
5. Run `/checkyourprocess:track` or click **Start tracking / 추적 시작**. The SessionStart hook supplies the native session ID; the tracking tool binds its separate tracker ID to that native session.

For the session-scoped source-build path above, the launch command is:

```powershell
claude --plugin-dir ./plugins/checkyourprocess
```

The extracted folder must directly contain `.claude-plugin/plugin.json`, `.mcp.json`, `dist/` and `hooks/`. If your archive tool added another directory layer, point to the inner folder. Keep this folder in place.

For a persistent install from the release ZIP, keep the extracted folder at `plugins/checkyourprocess` and create `plugins/.claude-plugin/marketplace.json`:

```json
{
  "name": "checkyourprocess-local",
  "owner": { "name": "CheckYourProcess" },
  "plugins": [
    { "name": "checkyourprocess", "source": "./checkyourprocess", "description": "Opt-in progress bands for parallel AI projects", "version": "0.1.0-beta.5" }
  ]
}
```

Then register the `plugins` folder from its parent folder:

```powershell
claude plugin marketplace add ./plugins
claude plugin install checkyourprocess@checkyourprocess-local
```

From a source build, register the generated `release` folder instead. Run these from the built repository and keep its staged directory under `release/`:

```powershell
claude plugin marketplace add ./release
claude plugin install checkyourprocess@checkyourprocess-local
```

`source` is resolved relative to the registered folder. Both register a local marketplace, not the GitHub repository as a prebuilt plugin. Earlier instructions passed `./release/claude-marketplace.json`; with Claude Code 2.1.326 that file path resolved `source` from the repository root and the marketplace failed to load. The folder paths above were verified with 2.1.326 on Linux. Starting with `claude --plugin-dir` is sufficient for the first test; choose a single installation path to avoid loading duplicate copies.

The band provides a details toggle, session/project scope and Korean/English language buttons. The details view pages through all tasks, connects a standalone session to an existing project, and links project tasks that this session is missing. beta.5 ships the Claude Code plugin without the in-chat card (`CYP_CARD=off` in its `.mcp.json`), so there is no full card to open; register new tasks from the chat. Other plugins sharing the same AbovePrompt site are preserved beneath this band.

**Claude Code 2.1.323에서 확인한 표시 조건:** 기본 터미널 렌더러에서는 바가 보여도 상세·언어 버튼의 마우스 클릭이 반응하지 않았습니다. 이 버전의 촬영·리허설은 다음처럼 전체 화면 렌더러로 실행해 버튼을 확인했습니다. 환경변수는 현재 PowerShell에서 새로 여는 Claude Code에 적용됩니다.

```powershell
$env:CLAUDE_CODE_NO_FLICKER = '1'
claude --plugin-dir ./plugins/checkyourprocess
```

이는 확인한 버전의 우회 방법이며 모든 Claude Code 버전의 조건으로 단정하지 않습니다. 창을 닫으면 해당 셸에만 설정한 환경변수도 끝납니다. 확인한 버튼과 남은 범위는 [촬영 기록](demo.md)을 참고하세요.

Reference: [Claude mods](https://code.claude.com/docs/en/plugins/mods/reference).

## Codex CLI

가장 작은 시작 경로는 빌드한 stdio MCP 서버만 등록하는 것입니다. `package.json`이 있는 빌드 폴더에서 실행하세요. 서버 등록은 Codex의 로컬 설정을 변경합니다. 이미 `checkyourprocess` 플러그인이 활성화되어 있다면 이중 등록하지 마세요.

```powershell
$cypStdio = (Resolve-Path ./dist/stdio.js).Path
codex mcp add checkyourprocess -- node "$cypStdio"
codex mcp list
codex
```

Codex CLI **0.167.1**의 로컬 도움말로 위 등록 명령 형식을 확인했습니다. 새 세션에서 `checkyourprocess` 도구를 확인하고 다음처럼 요청합니다.

> CheckYourProcess로 이 세션의 추적을 시작하고 구현·검증·리뷰를 등록해 주세요. 각 단계의 시작과 완료, 실행·대기 상태를 도구로 보고하고 현재 진행률을 보여 주세요.

이 방식은 MCP 서버만 등록합니다. 플러그인의 스킬·활동 훅을 함께 설치하지 않으므로 **명시적 도구 보고**를 사용합니다. CLI에 카드나 고정 바가 뜬다고 가정하지 않습니다. 도구 응답 또는 별도 터미널의 `node dist/cli.js preview`로 상태를 확인하세요. 등록한 절대 경로를 계속 사용하므로 빌드 폴더를 옮기면 등록 경로도 갱신해야 합니다.

플러그인·훅 경로를 개선할 때는 `integrations/codex/`를 사용합니다. 현재 CLI에는 `codex plugin` 명령도 있지만, 플러그인 설치·훅·실제 화면은 아래 앱 경로와 별도로 검증해야 합니다. 직접 등록한 MCP 서버 제거는 `codex mcp remove checkyourprocess`이며, 데이터는 보존됩니다.

The minimal CLI path adds only the stdio MCP server. It provides explicit progress tools, without installing plugin skills/hooks or promising a rendered MCP App card. The Codex desktop plugin path below is separate.

## Codex desktop app

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

The plugin includes lifecycle hooks and a shared relay for supported activity/plan events; actual event payloads require host-specific verification. It does not attach an unsupported fixed bar to Codex's composer, read Codex's private transcripts, or require direct access to the desktop app-server daemon.

## Claude Desktop Chat

The desktop app's **Code** tab runs Claude Code. It uses the native band described above, not the Chat MCP App. Claude shares one `AbovePrompt` area among mods; CheckYourProcess draws its own named, bordered panel with spacing in that area, even with Ponytail enabled. The surrounding area belongs to Claude and is not a separate window for each mod. See [the official band API](https://code.claude.com/docs/en/plugins/mods/interface#band-above-the-prompt).

1. Open Claude Desktop **Settings → Desktop app → Extensions → Advanced → Install Extension**. The exact label can vary with the current settings layout.
2. Select `release/checkyourprocess-claude-desktop-0.1.0-beta.5.mcpb`.
3. Enable the extension and restart Claude Desktop if requested. Verify the `checkyourprocess` tools appear in the conversation's tools/connectors menu.
4. Ask: “Start tracking this task and show its progress card.” Choose standalone, a new project, or an existing project in the card.

This is a directly installed desktop extension. It is distinct from an account-synced Claude plugin: bundled local servers in account plugins have different Chat/Cowork/Code availability. The local extension provides inline HTML; newer sidebar entry points, embedded external sites and app-side tools may require remote capabilities and are not necessary for this progress card.

Reference: [local desktop extensions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop), [MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started).

## ChatGPT with a private MCP tunnel

ChatGPT는 로컬 플러그인 ZIP이나 `.mcpb`를 직접 설치하는 경로와 다릅니다. 먼저 위 로컬 빌드·미리보기를 확인한 뒤 계정의 커스텀 MCP 권한과 터널 사용 권한을 확인하세요. 가입 상품만으로 연결 가능 여부를 판단하지 않습니다.

For ChatGPT's cloud-connected Chat surface, use the official Secure MCP Tunnel so the database can stay on the PC.

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
