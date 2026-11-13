# Contributing

Use Node.js 22.20 or newer on Windows. After cloning:

```powershell
npm ci
npm run typecheck
npm test
npm run package
```

Run the native band tests separately with the Claude Code host runner (verified with Claude Code 2.1.322 and 2.1.323):

```powershell
claude plugin test integrations/claude-code
```

`npm test` covers the Node tests only. `claude-code/testing` is supplied by the host, not an npm dependency. The band tests stub file/network access and do not read the user's runtime metadata. Tests that use loopback HTTP need an environment that permits local networking.

Use a temporary `CYP_DATA_DIR` when testing with real task data. Never include credentials or personal data in fixtures, screenshots, issues, or pull requests. The default interface language is Korean; user-visible changes must include both Korean and English strings.

Keep progress tied to canonical task IDs. Do not deduplicate tasks by title, interpret an ended response as completed work, or turn UI polling into an agent activity update. Add a focused regression test when changing concurrency, persistence, authentication, or lifecycle behavior.

Host compatibility checks must say which app/version was tested. A browser preview or an MCP protocol check does not prove a native desktop UI was loaded.

## 플랫폼별 사이드 프로젝트 참여

ChatGPT / Claude Desktop / Claude Code / Codex CLI 중 평소 쓰는 플랫폼 하나부터 참여할 수 있습니다. [이슈](https://github.com/SWJoong/CheckYourProcess/issues)에 관심 플랫폼, OS·앱 버전, 재현한 문제, 맡을 수 있는 범위를 남겨 주세요. 큰 기능 제안보다 설치와 첫 작업 추적의 막힘을 먼저 해결합니다. 별도의 참여 인원이나 일정이 확정되어 있지는 않습니다.

| 분야 | 첫 작업 예시 | 주로 살펴볼 위치 |
| --- | --- | --- |
| Claude Code | 새 설치·업데이트 재현, 바 잘림, 훅·병렬 상태 확인 | `integrations/claude-code/`, `integrations/shared/relay.mjs` |
| Claude Desktop | `.mcpb` 설치, 도구 발견, 카드 재연결 확인 | `integrations/claude-desktop/`, `src/ui/` |
| Codex CLI | 플러그인·stdio 설치 재현, 계획·활동 이벤트 차이 기록 | `integrations/codex/`, `integrations/shared/relay.mjs` |
| ChatGPT | 계정별 MCP·터널 안내 재현, 카드 갱신 확인 | `docs/installation.md`, `src/stdio.ts`, `src/ui/` |
| 공통 | 오류 안내·번역·문서 수정, 집계 회귀 수정 | `src/`, `tests/`, `docs/` |

플랫폼별로 저장소나 서버를 복제하지 않고 공통 서비스·DB·작업 ID를 사용합니다. 공통 변경은 다른 플랫폼의 호출부·타입·번역·테스트에 미치는 범위를 함께 확인해 주세요. 자동 추적·새 설정·의존성 추가는 실제 필요와 범위를 이슈에서 먼저 정리합니다.

PR에는 해결한 문제, 변경 후 동작, 실행한 검사, 실제 확인한 앱·버전, 남은 한계를 적습니다. 설치 보고에는 다음 내용을 붙여 주세요.

```text
플랫폼 / OS / 앱 버전 / CheckYourProcess 버전:
설치 방법과 실패한 단계:
재현 단계:
기대 결과 / 실제 결과:
첫 추적·진행 갱신·재연결·재시작 복원 결과:
```

실제 앱 확인 기준은 [베타 확인 항목](docs/beta.md), 편집 없는 시연 흐름은 [촬영 인계](docs/demo.md)를 참고하세요. 참여자가 없어도 유지 관리자가 플랫폼별로 순차 진행합니다.
