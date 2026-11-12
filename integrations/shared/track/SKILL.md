---
name: track
description: Start or resume CheckYourProcess progress tracking when the user asks. Keep registered progress current for this tracked task.
---

# CheckYourProcess

Start tracking only when the user explicitly asks to track, invokes this skill, or clicks the tracking control. Installing this plugin is not authorization to track every conversation.

If invoked with `show <trackingSessionId>`, call `show_progress` for that exact tracker and stop. This opens an existing tracker's full card; do not create or resume a different tracker. Claude Code has no card: its native bar is the display, so summarize the returned snapshot in one sentence instead.

1. Discover the `checkyourprocess` MCP tools. Call `get_catalog` to find existing projects and trackers.
2. If the user supplies a tracker ID, call `resume_tracking`. Otherwise call `start_tracking` with the actual host (`claude-code`, `codex`, `claude-desktop`, or `chatgpt`), a short task title, and a new `mutationId`. Default to a standalone session unless a project was requested. Create a project with `projectName` or join an explicitly selected `projectId`; never match projects solely by title.
3. In Claude Code/Codex, pass the native `hostSessionId` supplied by the SessionStart hook. Do not invent it or substitute an MCP transport session ID. Rebind on an explicit resume in a different native session. Without a known native ID, tracking still works through explicit reports.
4. Keep the returned `trackingSessionId`, task IDs and task revisions in this conversation. Call `show_progress` with that ID to open the internal card (Claude Code shows progress in its native bar and returns data only). Do not read other conversations or transcript files.
5. Register the concrete plan with `register_tasks`. For a shared project, inspect its project snapshot first: use `link_tasks` to share existing canonical task IDs, and register only genuinely new tasks. Identical titles do not establish identity.
6. Before work, update the relevant task to `in_progress`. Set it to `completed` only after that task actually succeeds and its necessary checks pass. Use `expectedRevision` from the latest snapshot and a fresh `mutationId` for each deliberate mutation. On a revision conflict, get the latest snapshot and reconcile the specific task; never blindly overwrite another session's changes.
7. Use `report_state` with `source: reported` when lifecycle hooks are unavailable. Report only observed running/waiting/interrupted/error/idle state. Update it before handing control back. Finishing an answer does not finish the project or its remaining tasks.
8. `end_tracking` ends tracking for this session only. It must never mark unfinished tasks complete.

The card's session/project selector changes the displayed scope. Its language setting switches all CheckYourProcess labels between 한국어 and English; do not translate user task/project titles. All four hosts share the local service and project task IDs.
