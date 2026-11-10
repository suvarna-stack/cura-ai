// ============================================================
// Full-screen boot state, and the indeterminate progress bar.
//
// The splash is the only place the mark appears at full size, so
// it is doing two jobs: covering the auth check, and being the
// first impression of the brand. Hence the status line — an
// unexplained logo on a blank screen reads as a stall, the same
// logo over "Connecting to iMed…" reads as work in progress.
// ============================================================
import { CuraSpinner } from './CuraSpinner'
import { CuraWordmark } from './CuraMark'

export function CuraSplash({
  status,
  tone = 'light',
}: {
  /** What is actually happening. "Loading workspace…", "Connecting to iMed…" */
  status: string
  tone?: 'light' | 'dark'
}) {
  const dark = tone === 'dark'
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-[22px]"
      style={{ background: dark ? '#0f2419' : '#f3f6f2' }}
    >
      <CuraSpinner
        variant="splash"
        size={dark ? 96 : 104}
        tone={tone}
        label={status}
      />
      <div className="text-center">
        <CuraWordmark size={15} tone={tone} />
        <p
          className="mt-1.5 font-brand-mono text-[11px] font-medium"
          style={{ color: dark ? '#79a88d' : '#71816f' }}
        >
          {status}
        </p>
      </div>
    </div>
  )
}

/**
 * Indeterminate bar for a fetch whose length we cannot know — it sits under
 * the tab strip while the queue reloads. A determinate bar would have to
 * invent a percentage, so this one only claims "something is happening".
 */
export function CuraProgressBar({ label }: { label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      className="h-[3px] w-full overflow-hidden"
      style={{ background: '#e6efe4' }}
    >
      <div
        className="h-full w-[30%]"
        style={{
          background: '#15503a',
          animation: 'barSlide 1.4s cubic-bezier(.65,0,.35,1) infinite',
        }}
      />
    </div>
  )
}
