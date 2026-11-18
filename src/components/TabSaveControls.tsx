import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Check, Save } from 'lucide-react'
import { Badge, Button, Modal } from '@/components/ui'
import {
  ensurePermanentSnapshotLoaded,
  restorePermanentSnapshot,
  savePermanentSnapshot,
} from '@/services/backupService'

const savedFingerprints = new Map<string, string>()

export function TabSaveControls({
  tabKey,
  tabLabel,
  buttonLabel,
  fingerprint,
  currentPathPrefix,
  size = 'md',
}: {
  tabKey: string
  tabLabel: string
  buttonLabel?: string
  fingerprint: string
  currentPathPrefix: string
  size?: 'sm' | 'md'
}) {
  const navigate = useNavigate()
  const [, setTick] = useState(0)
  const [savedToast, setSavedToast] = useState('')
  const [pendingRoute, setPendingRoute] = useState<string | null>(null)

  useEffect(() => {
    void ensurePermanentSnapshotLoaded()
  }, [])

  useEffect(() => {
    if (fingerprint && !savedFingerprints.has(tabKey)) {
      savedFingerprints.set(tabKey, fingerprint)
      void savePermanentSnapshot()
      setTick((t) => t + 1)
    }
  }, [tabKey, fingerprint])

  const savedFp = savedFingerprints.get(tabKey)
  const isDirty = savedFp !== undefined && fingerprint !== '' && fingerprint !== savedFp

  function showToast(msg: string) {
    setSavedToast(msg)
    setTimeout(() => setSavedToast((m) => (m === msg ? '' : m)), 2800)
  }

  async function handleSave() {
    savedFingerprints.clear()
    savedFingerprints.set(tabKey, fingerprint)
    setTick((t) => t + 1)
    await savePermanentSnapshot()
    showToast(`${tabLabel} saved permanently`)
  }

  // Warn on browser tab close / reload when unsaved changes exist
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  // Intercept in-app link clicks to other tabs when unsaved changes exist
  useEffect(() => {
    if (!isDirty) return
    const onClickCapture = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href') || ''
      const hashPath = href.startsWith('#') ? href.slice(1) : href
      if (!hashPath || hashPath.startsWith(currentPathPrefix)) return
      e.preventDefault()
      e.stopPropagation()
      setPendingRoute(hashPath)
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [isDirty, currentPathPrefix])

  async function confirmSaveAndLeave() {
    const dest = pendingRoute
    setPendingRoute(null)
    savedFingerprints.clear()
    savedFingerprints.set(tabKey, fingerprint)
    setTick((t) => t + 1)
    await savePermanentSnapshot()
    if (dest) navigate(dest)
  }

  async function confirmDiscardAndLeave() {
    const dest = pendingRoute
    setPendingRoute(null)
    savedFingerprints.clear()
    await restorePermanentSnapshot()
    if (dest) navigate(dest)
  }

  return (
    <>
      <div className="inline-flex items-center gap-2">
        {isDirty ? (
          <Badge color="amber">Unsaved changes</Badge>
        ) : (
          <Badge color="green">Saved</Badge>
        )}
        <Button
          size={size}
          variant="primary"
          onClick={() => void handleSave()}
          title={`Save ${tabLabel} permanently`}
        >
          <Save className="h-3.5 w-3.5" /> {buttonLabel ?? `Save ${tabLabel}`}
        </Button>
      </div>

      {savedToast &&
        createPortal(
          <div
            role="status"
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-900 shadow-lg"
          >
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            {savedToast}
          </div>,
          document.body,
        )}

      <Modal
        open={!!pendingRoute}
        onClose={() => setPendingRoute(null)}
        title={`Unsaved ${tabLabel} Changes`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You have unsaved changes in <b>{tabLabel}</b>. Would you like to save your information permanently before going to another tab?
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setPendingRoute(null)}>Stay on Page</Button>
            <Button variant="danger" onClick={() => void confirmDiscardAndLeave()}>
              Leave Without Saving
            </Button>
            <Button variant="primary" onClick={() => void confirmSaveAndLeave()}>
              <Save className="h-3.5 w-3.5" /> Save & Leave
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
