# beta.2 업그레이드 / Upgrade to beta.2

## 변경 사항

기본 저장 경로를 `%LOCALAPPDATA%/CheckYourProcess`에서 **`%USERPROFILE%/.checkyourprocess`**로 변경했습니다. Windows 패키지 앱은 AppData를 앱 전용 저장소로 돌려 쓸 수 있어, 터미널·Codex·Claude Desktop이 서로 다른 DB와 토큰으로 같은 포트에 접속하는 문제가 있었습니다.

beta.2에서는 같은 Windows 사용자 프로필의 공통 폴더를 사용합니다. `CYP_DATA_DIR`를 지정했다면 그 값이 우선하며, 모든 호스트에서 같은 경로여야 합니다. 별도 지정 시에도 AppData 밖 경로를 권장합니다.

## 업데이트 순서

1. 진행 중인 작업을 마친 뒤 이전 버전 서비스를 **그 버전의 CLI 또는 실행한 호스트에서 정상 종료**합니다. beta.2는 다른 버전·출처의 서비스를 임의 종료하지 않습니다.
2. Codex 플러그인, Claude Code 플러그인, Claude Desktop `.mcpb`를 모두 **0.1.0-beta.2**로 업데이트합니다. ChatGPT 터널은 업데이트된 `dist/stdio.js`를 실행하도록 연결합니다.
3. 모든 관련 앱과 터미널 세션을 재시작합니다. Codex에서 변경된 훅 검토가 표시되면 내용을 확인합니다.
4. `%USERPROFILE%/.checkyourprocess/runtime.json`이 생성되고 각 호스트가 같은 서비스에 연결하는지 확인합니다. 새 작업을 추적해 세션별·프로젝트 통합 보기를 시험합니다.

## 기존 데이터

**기존 DB·토큰·WAL 파일은 자동으로 이동·병합·삭제하지 않습니다.** beta.2의 새 기본 저장소는 별도로 시작하므로 기존 프로젝트가 바로 보이지 않을 수 있습니다.

이전 기록은 터미널의 `%LOCALAPPDATA%/CheckYourProcess` 또는 Claude 패키지의 `LocalCache/Local/CheckYourProcess`에 남아 있습니다. 여러 SQLite DB를 자동 병합하는 기능은 없습니다. 보관·이전을 검토할 때는 먼저 해당 서비스를 종료하고 DB와 WAL을 함께 고려해야 합니다. 실행 중인 DB 파일을 덮어쓰지 마세요.

## 공개 배포 파일

GitHub Release에는 `0.1.0-beta.2` ZIP 두 개와 MCPB 한 개를 첨부합니다. 로컬 `.stage-*`를 참조하는 `*-marketplace.json`, `.local/`, 사용자 DB·토큰은 올리지 않습니다.

## English

The shared default moves to `%USERPROFILE%/.checkyourprocess`, outside AppData virtualization. `CYP_DATA_DIR` still wins. Stop an older service using its own version's CLI, update Codex, Claude Code and the Claude Desktop MCPB to beta.2, then restart every host and any ChatGPT tunnel stdio target. Do not bypass hook review.

Old beta.1 stores, tokens and WAL files stay untouched. They are not automatically migrated or merged, so the new default store can start empty. Keep the old records; never overwrite a running SQLite database. Only publish the three beta.2 archives, not local marketplace catalogs or user data.
