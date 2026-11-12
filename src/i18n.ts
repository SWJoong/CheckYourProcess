import type { Activity, Host, Locale } from './types.js';

export const messages = {
  ko: {
    brand: 'CheckYourProcess', liveProgress: '실시간 작업 진행률',
    setupTitle: '작업의 흐름을 한눈에.', setupDescription: '새 작업을 추적하거나 기존 세션을 이어서 보세요.',
    track: '추적 시작', tracking: '추적 중', enableTracking: '추적 시작을 요청하세요',
    session: '세션별', project: '프로젝트 통합', scope: '표시 범위',
    details: '상세 보기', compact: '접기', settings: '설정', language: '표시 언어',
    taskTitle: '작업 이름', taskTitlePlaceholder: '예: 데스크톱 확장 만들기',
    host: '사용 앱', grouping: '프로젝트 연결', standalone: '독립 세션',
    newProject: '새 프로젝트', existingProject: '기존 프로젝트', projectName: '프로젝트 이름',
    projectNamePlaceholder: '예: CheckYourProcess', chooseProject: '프로젝트 선택',
    resume: '기존 세션 이어 보기', chooseSession: '세션 선택', open: '열기',
    newSession: '새 세션', tasks: '작업 목록', sessions: '병렬 세션',
    noPlan: '계획 없음', noTasks: '아직 등록된 작업이 없습니다.',
    noTasksDescription: '작업을 등록하면 완료율이 표시됩니다.',
    pending: '예정', in_progress: '진행 중', completed: '완료',
    idle: '대기', running: '실행 중', waiting: '입력 대기', interrupted: '중단', error: '오류',
    connected: '연결됨', disconnected: '연결 끊김', reconnect: '다시 연결',
    reconnecting: '연결 중…', lastUpdated: '최근 활동', neverUpdated: '아직 활동 보고 없음',
    reported: '보고된 상태', hook: '앱에서 확인된 상태', unknown: '확인되지 않음',
    addTasks: '작업 추가', taskLines: '한 줄에 하나씩 입력',
    taskLinesPlaceholder: '화면 구성\n상태 연결\n동작 검증',
    add: '추가', connectProject: '프로젝트에 연결', linkProject: '연결하기',
    linkTask: '이 세션에 연결', linkedTask: '이 세션의 작업', sharedTask: '공유 작업',
    browseShared: '공유 작업 보기', sharedNote: '공유 작업은 프로젝트에서 한 번만 계산됩니다.',
    independentNote: '다른 세션과 진행률을 공유하려면 프로젝트에 연결하세요.',
    complete: '전체 작업 완료', ended: '추적 종료됨', endTracking: '추적 종료',
    saving: '저장 중…', loading: '진행 상태를 불러오는 중…',
    copied: '복사됨', copySessionId: '세션 ID 복사',
    requestFailed: '요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.',
    invalidInput: '입력값을 확인해 주세요.', notFound: '선택한 작업이나 세션을 찾을 수 없습니다.',
    conflict: '다른 세션이 먼저 변경했습니다. 최신 상태로 갱신했으니 다시 시도해 주세요.',
    projectMismatch: '같은 프로젝트의 작업만 연결할 수 있습니다.',
    projectChange: '이미 다른 프로젝트에 연결된 세션입니다. 새 세션을 시작해 주세요.',
    sessionEnded: '추적이 종료된 세션입니다. 기존 세션 이어 보기로 다시 시작하세요.',
    connectionFailed: '서비스에 연결하지 못했습니다. 마지막으로 받은 상태를 표시합니다.',
    bridgeFailed: '앱 연결을 시작하지 못했습니다. 확장을 다시 열어 주세요.',
    hostToolUnavailable: '이 호스트가 카드의 도구 호출을 전달하지 못했습니다. 입력창 위 진행 바 또는 로컬 미리보기를 사용하세요. 호스트 연결을 복구한 뒤 다시 연결해 주세요.',
    contextSyncFailed: '상태는 저장됐지만 대화 연결을 갱신하지 못했습니다. 세션 ID를 복사해 대화에 전달해 주세요.',
    connectAgent: '앱 실행 상태도 자동으로 표시하려면, 이 대화에서 “이 세션에 진행 추적을 연결해 줘”라고 요청하세요.',
    requiredTitle: '작업 이름을 입력해 주세요.', requiredProject: '프로젝트를 선택하거나 이름을 입력해 주세요.',
    requiredTasks: '추가할 작업을 한 개 이상 입력해 주세요.',
    taskState: '작업 상태', allDone: '등록한 모든 작업을 완료했습니다.',
    close: '닫기', view: '보기', progress: '작업 완료율',
  },
  en: {
    brand: 'CheckYourProcess', liveProgress: 'Live work progress',
    setupTitle: 'Every task, in view.', setupDescription: 'Track a new task or pick up an existing session.',
    track: 'Start tracking', tracking: 'Tracking', enableTracking: 'Ask to start tracking',
    session: 'Session', project: 'Project', scope: 'View scope',
    details: 'Details', compact: 'Compact', settings: 'Settings', language: 'Display language',
    taskTitle: 'Session name', taskTitlePlaceholder: 'e.g. Build the desktop extension',
    host: 'App', grouping: 'Project connection', standalone: 'Independent session',
    newProject: 'New project', existingProject: 'Existing project', projectName: 'Project name',
    projectNamePlaceholder: 'e.g. CheckYourProcess', chooseProject: 'Choose a project',
    resume: 'Resume an existing session', chooseSession: 'Choose a session', open: 'Open',
    newSession: 'New session', tasks: 'Tasks', sessions: 'Parallel sessions',
    noPlan: 'No plan yet', noTasks: 'No tasks registered yet.',
    noTasksDescription: 'Add tasks to see completion progress.',
    pending: 'Pending', in_progress: 'In progress', completed: 'Completed',
    idle: 'Idle', running: 'Running', waiting: 'Waiting for input', interrupted: 'Interrupted', error: 'Error',
    connected: 'Connected', disconnected: 'Disconnected', reconnect: 'Reconnect',
    reconnecting: 'Connecting…', lastUpdated: 'Last activity', neverUpdated: 'No activity reported yet',
    reported: 'Reported state', hook: 'Observed app state', unknown: 'Unknown',
    addTasks: 'Add tasks', taskLines: 'One task per line',
    taskLinesPlaceholder: 'Build the interface\nConnect progress\nVerify the workflow',
    add: 'Add', connectProject: 'Connect to a project', linkProject: 'Connect',
    linkTask: 'Link to this session', linkedTask: 'Linked to this session', sharedTask: 'Shared task',
    browseShared: 'Browse shared tasks', sharedNote: 'Shared tasks count once in project progress.',
    independentNote: 'Connect a project to share progress across sessions.',
    complete: 'All tasks complete', ended: 'Tracking ended', endTracking: 'End tracking',
    saving: 'Saving…', loading: 'Loading progress…',
    copied: 'Copied', copySessionId: 'Copy session ID',
    requestFailed: 'The request could not be completed. Please try again.',
    invalidInput: 'Check the entered values.', notFound: 'The selected task or session could not be found.',
    conflict: 'Another session changed this task. The latest state is loaded; please try again.',
    projectMismatch: 'Only tasks from the same project can be linked.',
    projectChange: 'This session already belongs to another project. Start a new session instead.',
    sessionEnded: 'This session has ended. Resume it to continue tracking.',
    connectionFailed: 'The service is unavailable. Showing the last received state.',
    bridgeFailed: 'The app connection could not start. Please reopen the extension.',
    hostToolUnavailable: 'This host could not forward the card’s tool call. Use the native progress bar or local preview, then reconnect after the host connection is restored.',
    contextSyncFailed: 'Changes were saved, but the conversation context could not be updated. Copy the session ID and share it in the chat.',
    connectAgent: 'To also show automatic app activity, ask in this conversation: “Connect progress tracking to this session.”',
    requiredTitle: 'Enter a session name.', requiredProject: 'Select a project or enter its name.',
    requiredTasks: 'Enter at least one task to add.',
    taskState: 'Task status', allDone: 'Every registered task is complete.',
    close: 'Close', view: 'View', progress: 'Task completion',
  },
} as const;

export type TranslationKey = keyof typeof messages.ko;
export function t(locale: Locale, key: TranslationKey): string { return messages[locale][key]; }
export function activityLabel(locale: Locale, activity: Activity): string { return t(locale, activity); }
export function hostLabel(host: Host): string {
  return ({ 'claude-code': 'Claude Code', codex: 'Codex', 'claude-desktop': 'Claude Desktop', chatgpt: 'ChatGPT' })[host];
}
export function progressText(locale: Locale, completed: number, total: number): string {
  return locale === 'ko' ? `${completed}/${total} 완료` : `${completed}/${total} done`;
}
export function relativeTime(locale: Locale, iso: string | null, now = Date.now()): string {
  if (!iso) return t(locale, 'neverUpdated');
  const delta = Math.min(0, Math.round((new Date(iso).getTime() - now) / 1000));
  if (!Number.isFinite(delta)) return t(locale, 'unknown');
  const unit: Intl.RelativeTimeFormatUnit = Math.abs(delta) >= 3600 ? 'hour' : Math.abs(delta) >= 60 ? 'minute' : 'second';
  const divisor = unit === 'hour' ? 3600 : unit === 'minute' ? 60 : 1;
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(delta / divisor), unit);
}
export function errorLabel(locale: Locale, code?: string): string {
  const keys: Record<string, TranslationKey> = {
    INVALID_INPUT: 'invalidInput', NOT_FOUND: 'notFound', CONFLICT: 'conflict',
    PROJECT_MISMATCH: 'projectMismatch', PROJECT_CHANGE: 'projectChange', SESSION_ENDED: 'sessionEnded',
    CONNECTION_FAILED: 'connectionFailed', BRIDGE_FAILED: 'bridgeFailed',
    HOST_TOOL_UNAVAILABLE: 'hostToolUnavailable',
    CONTEXT_SYNC_FAILED: 'contextSyncFailed',
  };
  return t(locale, Object.hasOwn(keys, code ?? '') ? keys[code!] : 'requestFailed');
}
