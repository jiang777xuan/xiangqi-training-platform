import { useId, useRef, useState, type ChangeEvent } from 'react'
import { loadGameArchive, maxArchiveMoves, maxArchiveSize, serializeGameArchive, type LoadedArchive } from '../shared/xiangqi/archive'
import type { XiangqiMove } from '../shared/xiangqi'

interface GameArchiveControlsProps {
  initialFen: string
  moves: readonly XiangqiMove[]
  name?: string
  canImport: boolean
  onImport: (loaded: LoadedArchive) => void
}

export function GameArchiveControls({ initialFen, moves, name, canImport, onImport }: GameArchiveControlsProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const readRequest = useRef(0)
  const id = useId()
  const [pending, setPending] = useState<LoadedArchive | null>(null)
  const [reading, setReading] = useState(false)
  const [importError, setImportError] = useState('')
  const [exportError, setExportError] = useState('')

  function clearImport() {
    readRequest.current += 1
    setPending(null)
    setReading(false)
    setImportError('')
    if (fileInput.current) fileInput.current.value = ''
  }

  function open() {
    if (!canImport) return
    clearImport()
    dialog.current?.showModal()
  }

  function close() {
    clearImport()
    dialog.current?.close()
  }

  function handleClose() {
    if (!dialog.current?.open) clearImport()
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !canImport) return
    const request = ++readRequest.current
    const isCurrent = () => readRequest.current === request && dialog.current?.open
    setPending(null)
    setImportError('')
    setReading(true)

    try {
      if (file.size > maxArchiveSize) throw new Error('棋谱文件大小不能超过 256 KiB。')
      const text = await file.text()
      if (isCurrent()) setPending(loadGameArchive(text))
    } catch (error) {
      if (isCurrent()) {
        setImportError(error instanceof Error ? error.message : '无法读取棋谱文件。')
      }
    } finally {
      if (isCurrent()) setReading(false)
    }
  }

  function confirmImport() {
    if (!pending || !canImport || !dialog.current?.open) return
    onImport(pending)
    close()
  }

  function downloadArchive() {
    setExportError('')
    try {
      const json = serializeGameArchive(initialFen, moves, name)
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'xiangqi-game.json'
      document.body.append(link)
      try {
        link.click()
      } finally {
        link.remove()
        // Allow the browser to start reading the Blob before releasing the URL.
        window.setTimeout(URL.revokeObjectURL.bind(URL, url), 1000)
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '无法下载棋谱文件。')
    }
  }

  return (
    <>
      <button type="button" onClick={open} disabled={!canImport} aria-haspopup="dialog">导入棋谱</button>
      <button type="button" onClick={downloadArchive}>导出棋谱</button>
      {exportError && <p className="archive-export-error" role="alert">{exportError}</p>}
      <dialog className="game-dialog archive-dialog" ref={dialog} onClose={handleClose} aria-labelledby={`${id}-title`}>
        <header className="fen-dialog-header">
          <h2 id={`${id}-title`}>导入棋谱</h2>
          <button type="button" onClick={close}>关闭</button>
        </header>
        <p className="fen-help">选择 Xiangqi Master 的 JSON 棋谱。文件上限 256 KiB，最多 {maxArchiveMoves} 着。</p>
        <label className="archive-file-label" htmlFor={`${id}-file`}>选择 JSON 文件</label>
        <input id={`${id}-file`} ref={fileInput} type="file" accept=".json,application/json" onChange={handleFile} />
        {reading && <p className="fen-help" role="status">正在读取并校验棋谱…</p>}
        {importError && <p className="fen-error archive-import-error" role="alert">导入失败。{importError}</p>}
        {pending && (
          <p className="fen-confirmation archive-confirmation" role="status">
            已校验 {pending.archive.moves.length} 着。确认后将替换当前棋局及其棋谱。
          </p>
        )}
        <div className="fen-actions fen-import-actions archive-actions">
          <button type="button" onClick={close}>取消导入</button>
          <button type="button" className="fen-import-submit" disabled={!pending || reading} onClick={confirmImport}>确认导入棋谱</button>
        </div>
      </dialog>
    </>
  )
}
