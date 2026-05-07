import { useEffect, useState } from 'react'
import { getServe, type ServeStatus } from '../lib/serve'

export function useServeStatus(): ServeStatus {
  const [status, setStatus] = useState<ServeStatus>({ running: false })
  useEffect(() => {
    const serve = getServe()
    if (!serve) return
    let mounted = true
    serve.status().then((s) => { if (mounted) setStatus(s) }).catch(() => {})
    const unsub = serve.onStatusChanged((s) => { if (mounted) setStatus(s) })
    return () => { mounted = false; unsub() }
  }, [])
  return status
}
