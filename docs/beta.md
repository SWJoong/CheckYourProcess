# 베타 사용 안내 / Beta trial

Version: **0.1.0-beta.5**. Windows + Node.js 22.20.0 이상이 필요합니다.

## 이번 베타의 범위

같은 PC의 한 사용자가 작업·프로젝트·세션을 로컬에 저장하고 진행률을 확인하는 범위로 정리합니다. 개발 순서는 **설치·기본 작동 안정화 → 플랫폼별 최적화 → 사용성·기능 개선**입니다. 모든 플랫폼의 실사용 검증이 끝났다는 의미로 베타를 확정하지 않습니다.

[베타 릴리스](https://github.com/SWJoong/CheckYourProcess/releases/tag/v0.1.0-beta.5)에서 플랫폼별 설치 패키지를 받거나, [저장소](https://github.com/SWJoong/CheckYourProcess)의 소스를 받아 `npm ci`와 `npm run package`로 직접 만들 수 있습니다. 로컬 `release/`는 생성 폴더이므로 소스 클론·소스 ZIP에는 설치 패키지가 들어 있지 않습니다. 앱별 확인 결과와 남은 한계는 아래 기록과 릴리스 설명을 함께 확인하세요.

## 확인한 결과 — 2026-11-13

환경: Windows, Node.js **22.20.0**, npm **10.9.3**, CheckYourProcess **0.1.0-beta.5**. 사용자 기본 DB와 별도인 임시 데이터·빈 loopback 포트로 검증했습니다.

영상 반영 후 공개 준비 상태에서도 타입 검사·Node 테스트 49개·바 테스트 12개와 패키지 생성을 다시 통과했습니다. 이때 Claude Code 호스트 러너는 **2.1.323**이었습니다. 시연 MP4는 저장소에서 제공하고 설치 패키지에서는 제외합니다.

| 검사 | 결과 | 확인 범위 |
| --- | --- | --- |
| `npm ci` | 통과 | 잠금 파일로 새로 설치, audit 취약점 0건 |
| `npm run typecheck` | 통과 | TypeScript 타입 검사 |
| `npm test` | **49/49 통과** | 저장·집계·동시 수정·인증·전송·UI 상태·훅 회귀 검사 |
| `claude plugin test integrations/claude-code` | **12/12 통과** | Claude Code **2.1.322** 호스트 러너, 모의 파일·네트워크를 사용하는 바 렌더링·조작 검사 |
| `npm run package` | 통과 | Claude Code·Codex ZIP, Claude Desktop `.mcpb` 생성 |
| 압축 해제한 Claude Code 플러그인 검사 | 통과 | `claude plugin validate`와 바 테스트 12개. 공개 디렉터리용 아이콘 누락 경고는 남으며, 디렉터리 승인 검사는 별도 |
| 세 배포물 압축 해제·실행 | 통과 | 저장소 밖의 공백 포함 임시 경로, `node_modules`와 추가 `npm install` 없이 번들 실행 |
| 배포물 MCP·상태 검증 | 통과 | 세 stdio 서버의 도구 발견, 카드 리소스, 작업 등록·0/3→33%→66%, 기존 작업 ID 공유, 언어 저장, 일회용 미리보기, 서비스 재시작 후 복원 |
| 배포물 구성 | 통과 | 런타임·README·기여/보안 안내·대표 이미지·라이선스 포함, 토큰·DB·환경 파일·시연 MP4 제외 |
| Codex CLI 명령 형식 | 확인 | **0.167.1**의 `mcp add`·`mcp remove`·플러그인 명령 도움말. 실제 계정 설치·AI 호출 확인과는 별도 |

제한된 실행 환경에서는 loopback 통신 테스트가 실패할 수 있습니다. 위 49개와 배포물 검사는 로컬 통신이 허용된 환경에서 실행했습니다. 진행률의 소수점은 버리므로 `2/3`은 `66%`입니다.

## 실제 앱에서 남은 확인

| 플랫폼 | 확보한 근거 | 다음에 확인할 항목 |
| --- | --- | --- |
| Claude Code | 네이티브 바 12개 검사, [계획·서브 에이전트 이벤트 실측](design-auto-progress.md), 2.1.323 전체 화면 렌더러에서 실제 추적·두 세션 공유·언어·재시작 리허설 및 요약 영상 | 새 사용자 설치·업데이트, 기본 렌더러 버튼 반응, 프로젝트 연결·범위 전환 버튼 실측 |
| Claude Desktop Code 탭 | 5.11492에서 작업 5개 등록·진행 바 갱신·5/5·추적 종료 요약 영상 | 새 사용자 설치·업데이트, 상세·언어 버튼, 재연결·재시작. 일반 Chat 탭 검증과는 별도 |
| Claude Desktop Chat | `.mcpb` 구성·번들 stdio·카드 리소스 검사 | 앱에서 확장 설치, 카드 표시·갱신·재연결·재시작 |
| Codex CLI / 앱 | 번들 stdio·공통 상태 검사, CLI 도움말 확인 | CLI 실제 설치·도구 호출, 앱 카드, 플랫폼 고유 훅·계획 입력 |
| ChatGPT | 공통 MCP 서버·카드 리소스 검사, 공식 터널 안내 확인 | 계정 권한, 실제 터널 연결, ChatGPT 도구 호출·카드 갱신 |

한 플랫폼의 설치·기본 작동을 확인하려면 아래 순서가 모두 재현되어야 합니다. 확인하지 않은 칸은 미확인으로 남기고, 호스트 이름·버전·날짜·재현 절차·오류를 기록하세요.

- [ ] 새 환경에서 문서대로 설치하고 도구가 발견된다.
- [ ] 명시적 추적 시작 후 세 작업이 `0/3`으로 보이고, 실제 작업 완료 후 `1/3 (33%)`으로 바뀐다.
- [ ] 같은 프로젝트에 다른 세션이 기존 작업 ID로 참여해도 총 작업 수가 늘지 않는다.
- [ ] 해당 플랫폼의 표시 방식에서 상세·언어·세션/프로젝트 범위가 동작한다. CLI는 도구 응답·미리보기로 확인한다.
- [ ] 연결이 끊겼을 때 마지막 확인 값을 유지하고 오류를 알리며, 연결 복구 후 조회가 다시 된다.
- [ ] 서비스·앱 재시작 후 명시적으로 기존 추적을 재개하면 작업·언어 설정이 유지된다.
- [ ] 추적 종료·확장 제거가 미완료 작업을 완료 처리하거나 사용자 DB를 삭제하지 않는다.

이 항목이 통과한 플랫폼부터 기본 설치 경로로 안내하고, 그다음 고유 기능을 개선합니다. [시연 영상 2개](videos/README.md)는 실제 호스트에서 촬영한 배속 요약본입니다. 터미널의 자동 입력과 Desktop Code 탭의 자르기·가림 처리를 고지합니다. 영상 제작·프레임 검사와 전체 재생을 통한 사람의 최종 검수는 구분합니다.

## 버전별 변경과 업데이트

beta.5는 Claude Code에서 대화 안 상세 카드를 제거하고 입력창 위 바의 **상세**로 일원화합니다. 상세에서 모든 작업을 페이지로 넘겨 보고, 세션이 없는 프로젝트에 연결하고, 이 세션에 연결되지 않은 프로젝트 작업을 눌러 연결할 수 있습니다. Codex·Claude Desktop 일반 채팅·ChatGPT의 카드는 그대로입니다. 저장 경로와 DB는 beta.4와 같으며, 이전 서비스를 정상 종료한 뒤 확장들을 업데이트하고 호스트를 재시작하세요. 서브에이전트 정보가 훅으로 오는지 확인하는 선택 진단은 [연결 진단 안내](troubleshooting.md)에 있습니다.

beta.4는 MCP 초기 연결을 로컬 서비스 시작과 분리합니다. 카드의 호스트 호출 전달 오류를 구분하고 JSON 텍스트 응답도 처리합니다. [연결 진단 안내](troubleshooting.md)를 참고하세요. 호스트 자체의 도구 전달 문제를 해결했다고 의미하지는 않으며, 실제 앱의 재검증은 별도입니다.

beta.1에서 업데이트할 경우 [저장 경로 변경 및 재설치 안내](upgrade-beta2.md)를 먼저 확인하세요.

beta.3은 Claude Code의 입력창 위 표시를 다른 확장과 구분되는 제목·테두리·여백이 있는 패널로 변경합니다. 추적 시작 전에도 같은 패널을 사용합니다. beta.2의 저장 경로와 DB는 그대로이며, 기존 서비스를 정상 종료한 뒤 확장들을 업데이트하고 호스트를 재시작하세요.

Claude Desktop의 **Code 탭**에서는 Claude Code 플러그인의 입력창 위 패널이 표시됩니다. **Chat 탭**의 MCP App 카드와는 별개입니다. 입력창 위 공용 영역의 바깥 배경은 Claude가 관리하므로 확장마다 별도 창으로 나뉘지는 않습니다.

## 로컬에서 시작

앱별 확장을 설치한 뒤 앱을 재시작하고 새 대화에서 다음과 같이 요청하세요.

> CheckYourProcess로 이 작업의 추적을 시작해 주세요. 프로젝트 이름은 베타 테스트이고, 작업은 구현·검증·리뷰 세 단계입니다. 진행률 카드를 보여 주세요.

다른 세션에서는 기존 프로젝트를 선택하고 공통 작업을 연결하세요. 같은 이름의 프로젝트를 새로 만드는 대신 반환된 프로젝트 ID로 참여합니다.

1. 세 단계가 0/3으로 시작하는지 확인합니다.
2. 한 작업을 완료로 바꿔 1/3·33%가 되는지 확인합니다.
3. 다른 세션을 같은 프로젝트에 연결하고 세션별·프로젝트 통합 보기를 전환합니다.
4. 공통 작업을 두 세션에 연결해도 한 번만 집계되는지 확인합니다.
5. 한국어·English를 전환하고, 재시작 후 작업과 언어 설정이 유지되는지 확인합니다.

Codex는 **Settings → Hooks / Review hooks**에서 새 훅을 검토해야 자동 활동 표시가 켜집니다. 확장 설치만으로 기존 대화 기록을 가져오거나 작업 추적을 시작하지 않습니다.

Claude Code에서는 `/checkyourprocess:track`을 사용할 수 있습니다. 일반 Claude Desktop Chat은 `.mcpb`를 앱 설정에서 설치합니다. ChatGPT의 원격 연결은 사용자 계정에서 별도의 MCP·터널 설정이 필요합니다.

## 앱 없이 화면 확인

```powershell
npm start
node dist/cli.js preview
```

출력된 일회용 URL을 같은 PC의 브라우저에서 여세요. 이 URL과 토큰은 공유하지 마세요. 미리보기는 앱 확장과 같은 로컬 상태를 사용합니다.

## 베타 피드백

오류를 보고할 때 앱 이름·앱 버전·확장 버전·재현 단계·기대 결과·실제 결과를 적어 주세요. 토큰, 터널 키, 개인 작업 내용이 담긴 DB나 로그는 공개 이슈에 첨부하지 마세요.

## English

This beta is scoped to one Windows user on one PC. Installation and basic operation come before platform optimization and new features. On 2026-11-13, Node 22.20.0/npm 10.9.3 passed clean dependency installation, typecheck, 49 Node tests, 12 native band tests under Claude Code 2.1.322 (rerun with 2.1.323), and packaging. All three extracted runtimes were exercised outside the repository without installing dependencies: stdio discovery, UI resources, shared task progress, one-use preview and restart persistence passed. These checks do not establish a fresh installation or live UI flow in every host. ChatGPT's real account/tunnel connection remains unverified. Use the beta release assets or build the same packages from source.

After installing the host integration, restart the host and open a new conversation. Ask it to start CheckYourProcess tracking with three steps: implement, verify, review. Open the progress card, complete one step, and confirm 1/3 (33%). Join the same project from another session using the existing project ID and link an existing task; project progress must count that task once. Check both languages and persistence after restart.

Review new Codex lifecycle hooks before expecting observed activity. Claude Code supports `/checkyourprocess:track`; Claude Desktop Chat uses the `.mcpb` installer. ChatGPT needs a separate account-side MCP/tunnel connection. Report host/version/reproduction details without credentials or private task data.
