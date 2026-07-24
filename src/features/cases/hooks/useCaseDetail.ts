import { useEffect, useState } from 'react'
import type { ApiCaseDetail } from '../types/api.types'
import { fetchCaseDetail } from '../api/casesService'

export type CaseDetailStatus = 'loading' | 'ready' | 'error'

export function useCaseDetail(id: string | undefined): {
  detail: ApiCaseDetail | null
  status: CaseDetailStatus
} {
  const [detail, setDetail] = useState<ApiCaseDetail | null>(null)
  const [status, setStatus] = useState<CaseDetailStatus>(
    id ? 'loading' : 'error',
  )

  const [prevId, setPrevId] = useState(id)
  if (prevId !== id) {
    setPrevId(id)
    setDetail(null)
    setStatus(id ? 'loading' : 'error')
  }

  useEffect(() => {
    let cancelled = false
    if (!id) return
    fetchCaseDetail(id)
      .then((d) => {
        if (!cancelled) {
          setDetail(d)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return { detail, status }
}
