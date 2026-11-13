@AGENTS.md

## Claude Code 전용 메모

- 이 저장소에서 CheckYourProcess 플러그인으로 **자기 작업을 추적하려면 사용자가 그 세션에서 요청해야 합니다.** 요청 없이 `start_tracking`을 호출하지 마세요.
- `.claude/` 설정이나 `integrations/claude-code/hooks/hooks.json`을 바꿀 때는 `claude plugin test integrations/claude-code`를 실행하고, 사용한 Claude Code 버전을 PR에 적으세요.
