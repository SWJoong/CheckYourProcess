# CheckYourProcess 0.1.0-beta.5

AI와 합의한 작업의 진행률과 현재 활동 상태를 로컬 진행 바로 확인하는 Windows 베타입니다. 설치·첫 작업 추적·상태 갱신·재시작 후 복원을 안정화하는 단계이며, 플랫폼별 개선에 함께할 기여자를 모집합니다.

## 포함한 내용

- Claude Code 입력창 위 진행 바와 상세 보기: 작업 목록·한국어/English·프로젝트와 작업 연결.
- 세션별 보기와 고유 작업 ID를 사용하는 프로젝트 집계, 로컬 SQLite 저장.
- 지원하는 계획 목록 반영과 서브 에이전트 활동 표시. 중단·세션 종료 뒤 늦게 온 훅은 다음 프롬프트 전까지 무시.
- Claude Desktop Chat용 `.mcpb`, Codex용 플러그인·stdio MCP 경로, ChatGPT 개인 MCP·터널 안내.
- 목적·설치·사용법·플랫폼별 기여 안내, 대표 이미지, 실제 Claude Code 터미널·Desktop Code 탭 요약 영상 2개.

## 설치

[설치 안내](https://github.com/SWJoong/CheckYourProcess/blob/v0.1.0-beta.5/docs/installation.md)를 따릅니다. Node.js **22.20.0 이상**을 설치하고 아래에서 사용할 플랫폼의 파일 하나를 내려받으세요. 압축을 푼 런타임에는 Git·소스 빌드·추가 `npm install`이 필요하지 않습니다.

| 플랫폼 | 설치 파일 |
| --- | --- |
| Claude Code | [checkyourprocess-claude-code-0.1.0-beta.5.zip](https://github.com/SWJoong/CheckYourProcess/releases/download/v0.1.0-beta.5/checkyourprocess-claude-code-0.1.0-beta.5.zip) |
| Codex CLI / 앱 | [checkyourprocess-codex-0.1.0-beta.5.zip](https://github.com/SWJoong/CheckYourProcess/releases/download/v0.1.0-beta.5/checkyourprocess-codex-0.1.0-beta.5.zip) |
| Claude Desktop Chat | [checkyourprocess-claude-desktop-0.1.0-beta.5.mcpb](https://github.com/SWJoong/CheckYourProcess/releases/download/v0.1.0-beta.5/checkyourprocess-claude-desktop-0.1.0-beta.5.mcpb) |

ChatGPT 연결은 압축을 푼 패키지의 `dist/stdio.js`와 별도 계정·터널 설정을 사용합니다. 배포물에는 문서·라이선스를 넣고 영상·인증 키·DB를 제외했습니다.

직접 개발하려면 다음 명령으로 같은 패키지를 만들 수 있습니다. `release/`는 생성 폴더이며, GitHub의 자동 생성 Source code ZIP에는 설치 파일이 포함되지 않습니다.

```powershell
git clone https://github.com/SWJoong/CheckYourProcess.git
cd CheckYourProcess
npm ci
npm run package
```

## 시연과 검증

[56초 터미널 영상](https://github.com/SWJoong/CheckYourProcess/blob/main/docs/videos/shoot-auto-summary.mp4)과 [약 45초 Desktop Code 탭 영상](https://github.com/SWJoong/CheckYourProcess/blob/main/docs/videos/desktop-code-summary.mp4)은 소리 없는 배속 요약본입니다. 터미널 입력은 자동화 도구로 주입했고, Desktop 영상은 사이드바 자르기·계정 메뉴 가림 처리를 했습니다. 일반 Claude Desktop Chat 카드 영상은 아닙니다.

타입 검사, Node 테스트 **49개**, Claude Code 바 테스트 **12개**와 세 배포물의 독립 실행·공유 상태·미리보기·재시작 복원을 확인했습니다. 실제 호스트에서 확인한 범위는 [베타 검증 기록](https://github.com/SWJoong/CheckYourProcess/blob/v0.1.0-beta.5/docs/beta.md), 영상의 내용과 최종 검수 범위는 [영상 설명](https://github.com/SWJoong/CheckYourProcess/blob/v0.1.0-beta.5/docs/videos/README.md)에 남깁니다.

## 알려진 한계

- Windows·단일 사용자·한 PC의 공통 DB를 대상으로 합니다. 여러 PC 사이 진행률 동기화와 스토어 등록은 포함하지 않습니다.
- Claude Code 2.1.323의 상세·언어 버튼 클릭은 전체 화면 렌더러에서 확인했습니다. 기본 렌더러의 클릭 반응은 개선이 필요합니다.
- 새 사용자 설치·업데이트, 일부 버튼과 백그라운드 이벤트 순서, Claude Desktop 일반 Chat·Codex·ChatGPT의 전체 흐름은 추가 검증이 필요합니다.
- 계획 항목의 제목을 바꾸면 새 작업으로 잡힐 수 있습니다. 응답 종료나 추적 종료로 미완료 작업을 자동 완료하지 않습니다.

오류·참여 제안은 [기여 안내](https://github.com/SWJoong/CheckYourProcess/blob/v0.1.0-beta.5/CONTRIBUTING.md)를 참고해 플랫폼·앱 버전·재현 절차와 함께 남겨 주세요.
