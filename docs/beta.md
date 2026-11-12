# 베타 사용 안내 / Beta trial

Version: **0.1.0-beta.5**. Windows + Node.js 22.20.0 이상이 필요합니다.

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

After installing the host integration, restart the host and open a new conversation. Ask it to start CheckYourProcess tracking with three steps: implement, verify, review. Open the progress card, complete one step, and confirm 1/3 (33%). Join the same project from another session using the existing project ID and link an existing task; project progress must count that task once. Check both languages and persistence after restart.

Review new Codex lifecycle hooks before expecting observed activity. Claude Code supports `/checkyourprocess:track`; Claude Desktop Chat uses the `.mcpb` installer. ChatGPT needs a separate account-side MCP/tunnel connection. Report host/version/reproduction details without credentials or private task data.
