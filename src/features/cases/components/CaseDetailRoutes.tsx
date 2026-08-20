import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CaseDetailPage } from './CaseDetailPage'
import { IncompleteCaseDetailPage } from './IncompleteCaseDetailPage'
import { FinishedCaseDetailPage } from './FinishedCaseDetailPage'
import { ViewHistoryPage } from './ViewHistoryPage'
import { CaseLockedScreen } from './global/CaseLockedScreen'
import { useCaseLock } from '../hooks/useCaseLock'
import type {
  CompleteCase,
  FinishedCase,
  IncompleteCase,
} from '../types/case.types'

type LocState = {
  caseData?: CompleteCase | IncompleteCase | FinishedCase
  patientName?: string
  returnTo?: string
}

function fallbackComplete(id: string): CompleteCase {
  return { id, patient: id, dept: '—', confidence: 0 }
}

function fallbackIncomplete(id: string): IncompleteCase {
  return { id, patient: id, dept: '—', confidence: 0, missing: '—' }
}

function fallbackFinished(id: string): FinishedCase {
  return {
    id,
    patient: id,
    codedDate: '—',
    coder: '—',
    drg: '—',
  }
}

export function CaseDetailRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation() as { state?: LocState }
  const caseData =
    (state?.caseData as CompleteCase | undefined) ?? fallbackComplete(id)

  // One coder per case: the editor renders only while we hold the lock.
  const lock = useCaseLock(id)
  if (lock.status === 'acquiring') return null
  if (lock.status === 'held')
    return (
      <CaseLockedScreen
        caseId={id}
        holderName={lock.holder?.name ?? '—'}
        onBack={() => navigate('/cases')}
      />
    )

  return (
    <CaseDetailPage
      caseData={caseData}
      onBack={() => navigate('/cases')}
      onViewHistory={(caseId, patientName) =>
        navigate(`/cases/${caseId}/history`, {
          state: {
            patientName,
            returnTo: `/cases/${caseId}`,
            caseData,
          },
        })
      }
    />
  )
}

export function IncompleteCaseDetailRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation() as { state?: LocState }
  const caseData =
    (state?.caseData as IncompleteCase | undefined) ?? fallbackIncomplete(id)

  const lock = useCaseLock(id)
  if (lock.status === 'acquiring') return null
  if (lock.status === 'held')
    return (
      <CaseLockedScreen
        caseId={id}
        holderName={lock.holder?.name ?? '—'}
        onBack={() => navigate('/cases?tab=incomplete')}
      />
    )

  return (
    <IncompleteCaseDetailPage
      caseData={caseData}
      onBack={() => navigate('/cases?tab=incomplete')}
      onViewHistory={(caseId, patientName) =>
        navigate(`/cases/${caseId}/history`, {
          state: {
            patientName,
            returnTo: `/cases/${caseId}/incomplete`,
            caseData,
          },
        })
      }
    />
  )
}

export function FinishedCaseDetailRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation() as { state?: LocState }
  const caseData =
    (state?.caseData as FinishedCase | undefined) ?? fallbackFinished(id)

  return (
    <FinishedCaseDetailPage
      caseData={caseData}
      onBack={() => navigate('/cases?tab=finished')}
      onViewHistory={(caseId, patientName) =>
        navigate(`/cases/${caseId}/history`, {
          state: {
            patientName,
            returnTo: `/cases/${caseId}/finished`,
            caseData,
          },
        })
      }
    />
  )
}

export function ViewHistoryRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation() as { state?: LocState }
  const patientName =
    state?.patientName ??
    (state?.caseData as { patient?: string } | undefined)?.patient ??
    id
  const returnTo = state?.returnTo ?? `/cases/${id}`

  return (
    <ViewHistoryPage
      caseId={id}
      patientName={patientName}
      onBack={() => navigate(returnTo)}
    />
  )
}
