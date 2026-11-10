import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { id, label, error, hint, className, ...props },
    ref,
  ) {
    const inputId = id ?? (typeof label === 'string' ? label : undefined)

    return (
      <div className="w-full">
        {label != null && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-[12px] font-semibold text-muted"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-lg border bg-bg px-3 py-2.5 text-[13px] text-text outline-none transition-colors',
            'placeholder:text-muted/70',
            'focus:border-primary',
            error ? 'border-error' : 'border-border',
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error && inputId
              ? `${inputId}-error`
              : hint && inputId
                ? `${inputId}-hint`
                : undefined
          }
          {...props}
        />
        {error && (
          <p
            id={inputId ? `${inputId}-error` : undefined}
            className="mt-1 text-[12px] font-semibold text-error"
          >
            {error}
          </p>
        )}
        {!error && hint && (
          <p
            id={inputId ? `${inputId}-hint` : undefined}
            className="mt-1 text-[12px] text-muted"
          >
            {hint}
          </p>
        )}
      </div>
    )
  },
)
