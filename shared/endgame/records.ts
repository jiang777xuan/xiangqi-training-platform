export interface TrainingRecord {
  readonly puzzleId: string
  readonly completed: boolean
  readonly firstTryCorrect: boolean
  readonly hintCount: number
  readonly attempts: number
  readonly incorrectAttempts: number
  readonly completedAt: string | null
}

type TrainingEvent = 'hint' | 'incorrect' | 'correct' | 'complete'
const storageKey = 'xiangqi-master:endgame-records:v1'

function isTrainingRecord(value: unknown): value is TrainingRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TrainingRecord>
  return typeof record.puzzleId === 'string'
    && typeof record.completed === 'boolean'
    && typeof record.firstTryCorrect === 'boolean'
    && [record.hintCount, record.attempts, record.incorrectAttempts].every((count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)
    && (record.completedAt === null || typeof record.completedAt === 'string')
}

export function loadTrainingRecords(): readonly TrainingRecord[] {
  try {
    const raw = localStorage.getItem(storageKey)
    const decoded: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(decoded) ? decoded.filter(isTrainingRecord) : []
  } catch {
    return []
  }
}

export function updateTrainingRecords(records: readonly TrainingRecord[], puzzleId: string, event: TrainingEvent): readonly TrainingRecord[] {
  const previous = records.find((record) => record.puzzleId === puzzleId)
  const incorrectAttempts = (previous?.incorrectAttempts ?? 0) + Number(event === 'incorrect')
  const completed = previous?.completed || event === 'complete'
  const record: TrainingRecord = {
    puzzleId,
    completed,
    firstTryCorrect: previous?.completed ? previous.firstTryCorrect : completed && incorrectAttempts === 0,
    hintCount: (previous?.hintCount ?? 0) + Number(event === 'hint'),
    attempts: (previous?.attempts ?? 0) + Number(event !== 'hint'),
    incorrectAttempts,
    completedAt: previous?.completedAt ?? (completed ? new Date().toISOString() : null),
  }

  return [...records.filter((entry) => entry.puzzleId !== puzzleId), record]
}

export function saveTrainingRecords(records: readonly TrainingRecord[]): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records))
    return true
  } catch {
    return false
  }
}
