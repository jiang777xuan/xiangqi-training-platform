import { useId, useRef, useState, type FormEvent } from 'react'
import { createGameFromFen, createStandardGame, type XiangqiGame } from '../shared/xiangqi'

const examples = [
  { name: '标准开局示例', fen: createStandardGame().toFen() },
  { name: '残局示例（黑方应将）', fen: '1R2k4/9/9/9/9/9/9/9/9/3K5 b - - 12 8' },
]

const fenErrors: readonly (readonly [RegExp, string])[] = [
  [/facing each other/, '将帅同列时中间需要有棋子隔开。'],
  [/missing .* king|too many .* kings/, '红方和黑方各须有一枚将或帅。'],
  [/advisor|elephant/, '士或象的位置超出了允许范围。'],
  [/10 .*rows/, '棋盘应有 10 行，请用斜杠 / 分隔。'],
  [/squares in rank/, '棋盘每行应有 9 个交点。'],
  [/invalid piece/, '棋盘包含无法识别的棋子字母。'],
  [/consecutive number|digits 1 through 9/, '请用 1 到 9 的单个数字表示每段连续空位。'],
  [/side-to-move/, '行棋方应为 w（红方）或 b（黑方）。'],
  [/castling|en-passant/, '行棋方后的两个占位字段应为 - -。'],
  [/half[- ]move counter/, '半回合计数应为零或正整数，并在可用范围内。'],
  [/move number/, '回合号应为正整数，并在可用范围内。'],
  [/space-delimited fields/, 'FEN 应有 1 到 6 个用空格分隔的字段。'],
]

function importErrorMessage(error: unknown) {
  const reason = error instanceof Error ? error.message : ''
  const detail = fenErrors.find(([pattern]) => pattern.test(reason))?.[1]
  return `导入失败。${detail ?? '请检查 FEN 的棋盘布局和字段格式。'}`
}

interface FenDialogProps {
  fen: string
  hasHistory: boolean
  canImport: boolean
  onImport: (game: XiangqiGame) => void
}

export function FenDialog({ fen, hasHistory, canImport, onImport }: FenDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const exportField = useRef<HTMLTextAreaElement>(null)
  const importField = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const [draft, setDraft] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [importError, setImportError] = useState('')
  const [pendingGame, setPendingGame] = useState<XiangqiGame | null>(null)

  function open() {
    setDraft('')
    setCopyMessage('')
    setImportError('')
    setPendingGame(null)
    dialog.current?.showModal()
  }

  function close() {
    setPendingGame(null)
    dialog.current?.close()
  }

  async function copyFen() {
    try {
      const clipboard = navigator.clipboard
      if (clipboard?.writeText) {
        await clipboard.writeText(fen)
        if (dialog.current?.open) setCopyMessage('已复制 FEN。')
        return
      }
    } catch {
      // Clipboard access can be denied by the browser. Offer text selection below.
    }

    if (!dialog.current?.open) return
    exportField.current?.focus()
    exportField.current?.select()
    setCopyMessage('剪贴板不可用，已选中 FEN。可使用 Ctrl+C、⌘+C 或长按复制。')
  }

  function changeDraft(value: string) {
    setDraft(value)
    setImportError('')
  }

  function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canImport) return

    if (pendingGame) {
      onImport(pendingGame)
      close()
      return
    }

    if (!draft.trim()) {
      setImportError('请输入 FEN 字符串。')
      importField.current?.focus()
      return
    }

    let candidate: XiangqiGame
    try {
      candidate = createGameFromFen(draft)
    } catch (error) {
      setImportError(importErrorMessage(error))
      importField.current?.focus()
      return
    }

    if (hasHistory) {
      setPendingGame(candidate)
      return
    }

    onImport(candidate)
    close()
  }

  return (
    <>
      <button type="button" onClick={open} aria-haspopup="dialog">局面 FEN</button>
      <dialog className="game-dialog fen-dialog" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}>
        <header className="fen-dialog-header">
          <h2 id={`${id}-title`}>局面 FEN</h2>
          <button type="button" onClick={close}>关闭</button>
        </header>
        <p className="fen-help" id={`${id}-help`}>FEN 仅记录当前局面、行棋方和计数。导入后会从空棋谱开始。</p>

        <section className="fen-section" aria-label="导出局面">
          <label htmlFor={`${id}-export`}>当前局面 FEN</label>
          <textarea id={`${id}-export`} ref={exportField} value={fen} readOnly rows={3} wrap="soft" spellCheck={false} />
          <div className="fen-actions">
            <button type="button" onClick={copyFen}>复制 FEN</button>
            <span className="fen-message" role="status">{copyMessage}</span>
          </div>
        </section>

        {canImport ? (
          <form className="fen-section fen-import" onSubmit={submitImport}>
            <label htmlFor={`${id}-import`}>粘贴 FEN</label>
            <textarea
              id={`${id}-import`}
              ref={importField}
              value={draft}
              onChange={(event) => changeDraft(event.target.value)}
              readOnly={pendingGame !== null}
              aria-invalid={importError ? true : undefined}
              aria-describedby={importError ? `${id}-error` : undefined}
              rows={3}
              wrap="soft"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <div className="fen-examples">
              {examples.map((example) => (
                <button type="button" key={example.name} disabled={pendingGame !== null} onClick={() => changeDraft(example.fen)}>
                  {example.name}
                </button>
              ))}
            </div>
            {importError && <p className="fen-error" id={`${id}-error`} role="alert">{importError}</p>}
            {pendingGame && <p className="fen-confirmation" role="alert">导入会覆盖当前局面，并清空已有棋谱及悔棋记录。</p>}
            <div className="fen-actions fen-import-actions">
              {pendingGame && (
                <button type="button" onClick={() => { setPendingGame(null); importField.current?.focus() }}>取消覆盖</button>
              )}
              <button className="fen-import-submit" type="submit">{pendingGame ? '确认覆盖' : '导入局面'}</button>
            </div>
          </form>
        ) : <p className="fen-help fen-replay-note">当前显示的是复盘局面。回到最新局面后可导入 FEN。</p>}
      </dialog>
    </>
  )
}
