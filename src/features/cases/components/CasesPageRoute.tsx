import { useNavigate, useSearchParams } from 'react-router-dom'
import { CasesPage as CasesPageView } from './CasesPage'
import type {
  CaseTab,
  CompleteCase,
  FinishedCase,
  IncompleteCase,
} from '../types/case.types'

const TABS: CaseTab[] = ['complete', 'incomplete', 'reopen', 'finished']

/** Route wrapper — owns tab in the URL and navigates into detail pages. */
export function CasesPageRoute() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: CaseTab = TABS.includes(raw as CaseTab)
    ? (raw as CaseTab)
    : 'complete'

  const setTab = (next: CaseTab) => {
    setParams(next === 'complete' ? {} : { tab: next }, { replace: true })
  }

  return (
    <CasesPageView
      tab={tab}
      setTab={setTab}
      openCase={(c: CompleteCase) =>
        navigate(`/cases/${c.id}`, { state: { caseData: c, kind: 'complete' } })
      }
      openIncompleteCase={(c: IncompleteCase) =>
        navigate(`/cases/${c.id}/incomplete`, {
          state: { caseData: c, kind: 'incomplete' },
        })
      }
      openFinishedCase={(c: FinishedCase) =>
        navigate(`/cases/${c.id}/finished`, {
          state: { caseData: c, kind: 'finished' },
        })
      }
    />
  )
}
