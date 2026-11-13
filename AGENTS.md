# AGENTS.md — AI 코딩 도구용 작업 규칙

이 저장소에서 코드를 고치는 AI(Claude Code, Codex, ChatGPT 등)와 사람이 함께 지키는 규칙입니다. 작업 전에 읽고, 어긋나는 요청을 받으면 임의로 진행하지 말고 사용자에게 먼저 알려 주세요. 사람용 안내는 [CONTRIBUTING.md](CONTRIBUTING.md), 구조는 [docs/architecture.md](docs/architecture.md)에 있습니다.

## 프로젝트 한 줄 요약

AI에게 맡긴 작업의 **완료율**과 에이전트의 **활동 상태**를 작은 진행 바로 보여 주는 로컬 도구입니다. 로컬 Node.js 서비스 하나, SQLite, 공통 MCP 서버, 플랫폼별 표시 어댑터로 이루어집니다. Windows·단일 사용자·같은 PC가 대상인 베타(`0.1.0-beta.5`)입니다.

## 명령어

Node.js 22.20 이상, Windows 기준입니다.

```powershell
npm ci                  # 의존성 설치
npm run typecheck       # 타입 검사
npm test                # Node 테스트 (tests/*.test.ts)
npm run package         # 빌드 + release/ 에 플랫폼별 설치 파일 생성
node dist/cli.js preview   # 앱 연결 없이 로컬 화면 확인
claude plugin test integrations/claude-code   # 바 테스트. Claude Code가 설치된 환경에서만
```

- `npm test`에는 바 테스트가 **포함되지 않습니다**. Claude Code 바(`integrations/claude-code/`)를 고쳤다면 마지막 명령을 따로 실행하세요.
- 루프백 HTTP를 막는 샌드박스에서는 통신 테스트 일부가 실패할 수 있습니다. 실패한 이유를 확인하지 않고 "원래 실패한다"고 넘기지 마세요.
- 실제 작업 데이터로 시험할 때는 임시 `CYP_DATA_DIR`과 다른 `CYP_PORT`를 씁니다. 기본 데이터 폴더는 `%USERPROFILE%/.checkyourprocess`, 기본 포트는 `49173`입니다.
- 서비스 코드를 고친 뒤에는 새 빌드로 서비스를 다시 시작하세요(`node dist/cli.js stop` 후 시작). 예전 서비스는 새 필드를 거부합니다.

## 어디가 누구 영역인가

| 위치 | 역할 | 수정 시 |
| --- | --- | --- |
| `src/store.ts`, `src/service.ts`, `src/types.ts`, `src/mcp.ts`, `src/runtime.ts`, `src/i18n.ts` | 공통 저장·집계·인증·MCP·번역 | **모든 플랫폼에 영향.** 작게, 테스트와 함께. 유지 관리자 리뷰 필수 |
| `integrations/shared/relay.mjs` | 훅 이벤트를 로컬 서비스로 전달 | 공통 영역으로 취급 |
| `src/ui/` | MCP App 카드 (Claude Desktop, Codex 앱, ChatGPT 공용) | 공통 영역으로 취급 |
| `integrations/claude-code/` | Claude Code 플러그인, 입력창 위 바, 훅 | Claude Code 담당 |
| `integrations/claude-desktop/` | `.mcpb` 확장, 로케일 | Claude Desktop 담당 |
| `integrations/codex/` | Codex 플러그인·훅 설정 | Codex 담당 |
| `src/stdio.ts`, `docs/installation.md`의 ChatGPT 절 | ChatGPT용 stdio·터널 안내 | ChatGPT 담당 |
| `docs/`, `README.md` | 설명서 | 누구나. 사실과 어긋나지 않게 |

플랫폼별로 저장소나 서버를 복제하지 않습니다. 공통 서비스·DB·작업 ID를 그대로 씁니다. 한 플랫폼을 고치다가 공통 영역을 바꿔야 하면, 다른 플랫폼의 호출부·타입·번역·테스트에 미치는 범위를 먼저 확인하고 PR에 적으세요.

## 지켜야 할 규칙

1. **작업은 고유 ID로만 식별합니다.** 제목으로 병합하거나 중복을 제거하지 않습니다. 라벨은 표시용 글자일 뿐입니다. (한 세션 안에서 계획 목록 항목을 대응시키는 `applyPlan`만 예외이며, 프로젝트 간 병합 기준이 아닙니다.)
2. **응답 종료·`Stop` 이벤트·서브 에이전트 종료·추적 종료는 작업 완료가 아닙니다.** 작업을 `completed`로 바꾸는 것은 실제로 마치고 필요한 검증을 한 뒤입니다.
3. **완료율과 활동 상태를 섞지 않습니다.** UI가 상태를 조회(polling)하는 것은 에이전트 활동으로 세지 않습니다.
4. **추적은 사용자가 그 세션에서 명시적으로 요청했을 때만 시작합니다.** 설치만으로, 또는 훅만으로 새 세션을 추적하지 않습니다. 추적하지 않는 세션의 훅 입력은 서버가 저장 없이 무시합니다.
5. **상태는 앞으로만 갑니다**(`pending` < `in_progress` < `completed`). 오래된 목록이 완료된 작업을 되돌리거나 작업을 지우지 못합니다.
6. **변경 요청은 revision과 mutation ID를 지킵니다.** 재시도로 작업이 중복 생성되거나 완료가 두 번 집계되면 안 됩니다. 훅 이벤트는 무작위 이벤트 ID를 씁니다(고정 ID로 두면 두 번째 이벤트가 중복으로 버려지는 버그가 실제로 있었습니다).
7. **사용자 화면 문구는 한국어와 영어를 함께 고칩니다.** 기본 언어는 한국어입니다. 사용자가 만든 작업·프로젝트 이름은 번역하거나 바꾸지 않습니다.
8. **동시성·저장·인증·수명주기 동작을 바꾸면 그 동작을 겨냥한 회귀 테스트를 추가합니다.**
9. **확인하지 않은 것을 확인했다고 쓰지 않습니다.** 호환성 기록에는 실제로 시험한 앱과 버전을 적습니다. 브라우저 미리보기나 MCP 프로토콜 점검만으로 "네이티브 앱에서 확인"이라고 하지 않습니다. 새 한계를 발견하면 [docs/design-auto-progress.md](docs/design-auto-progress.md)나 PR 설명에 남기세요.

## 하지 말 것

- `~/.checkyourprocess/runtime.json`과 `token`을 읽거나 출력하거나 커밋하지 않습니다. 인증 토큰이 들어 있습니다. 일회용 인증 URL도 같습니다.
- `progress.sqlite`를 직접 고치지 않습니다. 필요하면 `end_tracking` 후 `resume_tracking` 같은 공식 동작을 씁니다.
- 기존 대화 로그·트랜스크립트를 읽어 작업을 가져오지 않습니다. 이 프로젝트는 대화 기록을 가져오지 않는 것을 원칙으로 합니다.
- relay가 서버로 보내는 도구 입력을 넓히지 않습니다. 지금은 계획 도구(`update_plan`, `TodoWrite`)의 항목 글과 상태만 **로컬 서비스**로 보냅니다. 늘려야 한다면 이슈에서 먼저 합의하고 `tests/relay-forward.test.ts`를 함께 고치세요.
- 의존성, 새 설정, 자동 추적 기능은 이슈에서 필요와 범위를 먼저 합의한 뒤에 추가합니다.
- `dist/`, `release/`, `.local/`, `*.sqlite*`, `*.log`, `.env*`, `runtime.json`, `token`은 커밋하지 않습니다(`.gitignore` 대상).
- 이용자·사례·가족 등 **실제 사람의 정보**를 테스트 데이터, 작업 이름, 스크린샷, 이슈, PR에 넣지 않습니다. 예시와 테스트 입력은 지어낸 값으로 씁니다.

## 작업을 마치기 전에

1. `npm run typecheck`와 `npm test`를 실행하고 결과를 그대로 보고합니다. 실패하면 실패한 테스트 이름과 출력을 함께 적습니다.
2. 바나 훅을 고쳤다면 `claude plugin test integrations/claude-code`도 실행합니다. 못 했다면 못 했다고 적습니다.
3. 배포물에 영향이 있으면 `npm run package`가 통과하는지 확인합니다.
4. 사용자 화면이 바뀌었다면 한국어·영어를 모두 확인합니다.
5. PR 설명에 [템플릿](.github/PULL_REQUEST_TEMPLATE.md)의 항목(해결한 문제, 변경 후 동작, 실행한 검사, 실제 확인한 앱·버전, 남은 한계)을 채웁니다.

## 커밋과 PR

- 한 PR에는 한 가지 문제만 담습니다. 플랫폼 수정과 공통 수정이 함께 필요하면 공통 수정을 먼저 별도 PR로 냅니다.
- 커밋 메시지는 `feat:`, `fix:`, `docs:`, `test:` 같은 접두어와 한 줄 요약을 씁니다.
- CI(`.github/workflows/ci.yml`)가 push와 PR마다 Windows에서 typecheck, 테스트, 패키징을 돌립니다. 통과하지 못한 PR은 병합하지 않습니다. 바 테스트는 CI에 없으므로 Claude Code 관련 PR은 작성자가 로컬 결과를 적습니다.
- 공통 영역(위 표 참고)을 건드린 PR은 유지 관리자 리뷰를 받습니다.

## 막혔을 때

설치·실행 오류는 [docs/troubleshooting.md](docs/troubleshooting.md)를 먼저 확인하세요. 원인이 불분명하면 추측으로 우회하지 말고, 재현 단계와 실제 출력을 이슈 템플릿 형식으로 정리해 사용자에게 알려 주세요.
