# Contributing

Use Node.js 22.20 or newer on Windows. After cloning:

```powershell
npm ci
npm run typecheck
npm test
npm run package
```

Use a temporary `CYP_DATA_DIR` when testing with real task data. Never include credentials or personal data in fixtures, screenshots, issues, or pull requests. The default interface language is Korean; user-visible changes must include both Korean and English strings.

Keep progress tied to canonical task IDs. Do not deduplicate tasks by title, interpret an ended response as completed work, or turn UI polling into an agent activity update. Add a focused regression test when changing concurrency, persistence, authentication, or lifecycle behavior.

Host compatibility checks must say which app/version was tested. A browser preview or an MCP protocol check does not prove a native desktop UI was loaded.
