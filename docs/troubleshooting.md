# Connection diagnostics / 연결 진단

## 서로 다른 연결 경로

- **Claude Code 입력창 위 바:** native mod가 인증된 로컬 서비스에 조회합니다.
- **대화 안 상세 카드:** 호스트가 카드의 MCP 도구 호출을 서버에 전달합니다.
- **로컬 미리보기:** 같은 PC의 인증된 미리보기 세션으로 서비스를 조회합니다.

한 화면이 동작한다고 다른 연결 경로까지 검증된 것은 아닙니다. `계획 없음`은 작업 목록이 비어 있다는 뜻이며 연결 오류와는 별개입니다.

## 카드 오류 확인

beta.4는 다음 오류를 구분합니다. 마지막으로 확인된 값은 유지하며, 오류를 성공으로 표시하지 않습니다.

| 표시 | 의미와 다음 확인 |
| --- | --- |
| 서비스에 연결하지 못했습니다 | 서비스 중단, 타임아웃, 응답 누락 등을 확인합니다. `node dist/cli.js status`로 현재 버전의 서비스 상태를 확인하세요. |
| 호스트가 카드의 도구 호출을 전달하지 못했습니다 | 호스트가 명시적으로 `IPC not available for MCP tool call` 오류를 반환한 경우입니다. 입력창 위 바나 로컬 미리보기를 사용할 수 있습니다. 호스트 연결을 복구한 뒤 카드의 **다시 연결**을 누르세요. 이 오류에서는 자동 조회를 멈춥니다. |
| 앱 연결을 시작하지 못했습니다 | 카드와 호스트의 초기 연결이 실패했습니다. 카드를 다시 여세요. |

Claude Desktop Code 탭의 플러그인 MCP App 호출 전달에 관한 [유사 버그 보고](https://github.com/anthropics/claude-code/issues/106708)가 있습니다. 그 보고만으로 특정 Windows 환경의 원인을 단정할 수는 없습니다. beta.4의 오류 구분은 실제로 받은 메시지를 기준으로 하며, 호스트 자체를 수정하지 않습니다.

## Claude Code에는 대화 안 카드가 없습니다 (beta.5)

Claude Code 플러그인은 `.mcp.json`의 `CYP_CARD=off`로 MCP App 카드를 등록하지 않습니다. 위 표의 카드 오류는 Claude Code에서 발생하지 않으며, 표시·언어·범위·프로젝트 연결·작업 연결은 입력창 위 바의 **상세**에서 합니다. Codex, Claude Desktop 일반 채팅, ChatGPT는 카드를 그대로 사용합니다.

## 훅 입력 필드 진단 로그 (선택)

서브에이전트 같은 병렬 작업 정보가 훅으로 전달되는지 확인할 때만 사용합니다. 데이터 디렉터리에 빈 파일 `debug-hook-keys.enabled`를 만들면 `debug-hook-keys.log`에 훅 입력의 **필드 이름과 값의 종류**만 기록합니다. 값을 남기는 필드는 `hook_event_name`, `tool_name`, `agent_id`, `agent_type`, `subagent_type`, `parent_agent_id`, `permission_mode`뿐이며 프롬프트·명령·파일 경로·transcript와 도구 입력·결과의 값은 기록하지 않습니다. 도구 입력(`tool_input`)과 결과(`tool_response`)는 **필드 이름만** 최대 4단계까지 남기며, 배열은 길이와 앞 3개 항목의 필드 이름만 기록합니다. `SubagentStart`/`SubagentStop` 훅은 이 로그에만 쓰이고 추적 상태에는 반영하지 않습니다. 로그가 2MB를 넘으면 기록을 멈춥니다.

```powershell
New-Item "$env:USERPROFILE\.checkyourprocess\debug-hook-keys.enabled" -ItemType File
# 병렬 작업을 실행한 뒤
Get-Content "$env:USERPROFILE\.checkyourprocess\debug-hook-keys.log"
# 끝나면 기록을 끄고 로그를 지웁니다
Remove-Item "$env:USERPROFILE\.checkyourprocess\debug-hook-keys.enabled","$env:USERPROFILE\.checkyourprocess\debug-hook-keys.log"
```

## 서버 시작과 버전

beta.4의 stdio 서버는 로컬 서비스가 준비되지 않아도 MCP 초기화와 도구·리소스 목록 조회에 응답합니다. 서비스는 실제 도구를 사용할 때 시작합니다. 따라서 도구 목록이 보인다는 사실만으로 작업 데이터 조회까지 성공했다고 판단하지 마세요.

업데이트할 때는 작업을 저장하고 호스트를 닫은 뒤 **이전 버전의 CLI**로 이전 서비스를 정상 종료하세요. 그다음 세 로컬 확장과 필요한 터널 실행 파일을 같은 버전으로 갱신합니다. 다른 포트의 프로세스를 강제 종료하거나 토큰을 삭제하지 마세요. beta.4는 beta.3과 같은 저장 경로·DB를 사용합니다.

## 로컬 미리보기

```powershell
node dist/cli.js start
node dist/cli.js preview
```

두 명령은 서비스를 시작하고 일회용 로컬 인증 URL을 발급합니다. 출력된 URL은 같은 PC에서만 열고 공유하지 마세요. 설정이나 사용자 데이터를 초기화할 필요는 없습니다.

## English

beta.5 ships Claude Code without the in-chat card (`CYP_CARD=off`); its bar details view handles scope, language, task paging, project connection and task linking. An opt-in diagnostic (`debug-hook-keys.enabled` in the data directory) writes only hook field names, plus a few short identifiers such as `agent_id`, to `debug-hook-keys.log`; it never records prompts, commands, paths, tool input or result values, or transcripts. Tool input and result are recorded as field names only (up to four levels; arrays as their length plus the field names of the first three items).

The native Claude Code bar, embedded MCP App card, and local preview use different connection paths. beta.4 distinguishes the host's explicit tool-forwarding IPC error from a generic connection failure. The IPC error pauses automatic polling until you reconnect; it does not imply that the database or native bar is offline. The host itself still needs to forward card requests correctly.

The stdio server now answers discovery before starting the local writer. Successful discovery is not proof of successful data access. Update all integrations consistently, stop an old service with its own CLI, and retain the existing data directory. The local preview uses the same state; keep its authentication URL private.
