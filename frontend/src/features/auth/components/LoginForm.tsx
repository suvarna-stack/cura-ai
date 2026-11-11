import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '../../../components/ui/Button'
import { CuraMark, CuraWordmark } from '../../../components/brand/CuraMark'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { extractAuthError } from '../api/authService'
import { roleHome, useAuth } from '../hooks/useAuth'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../types/auth.types'
import { loginSchema, type LoginFormValues } from '../types/login.schema'

/** Shared login for both roles — where you land depends on your account:
 *  coder → /cases, admin → /admin/dashboard (strict role routing). */
export function LoginForm() {
  const navigate = useNavigate()
  const { user, ready, login } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  useDocumentTitle("Sign in")

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  // already logged in (e.g. back-button to /login) → straight to role home
  if (ready && user) {
    return <Navigate to={roleHome(user.role)} replace />
  }

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null)
    try {
      const loggedIn = await login(values)
      navigate(roleHome(loggedIn.role), { replace: true })
    } catch (err) {
      // 401 "invalid email or password" / 429 lockout — show the server's words
      setSubmitError(extractAuthError(err))
    }
  }

  const fillDemoCredentials = () => {
    setValue('email', DEMO_EMAIL, { shouldValidate: true })
    setValue('password', DEMO_PASSWORD, { shouldValidate: true })
    setSubmitError(null)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm">
        {/* brand */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <CuraMark size={44} />
          <h1>
            <CuraWordmark size={20} />
          </h1>
          <p className="text-[12px] font-semibold text-primary">
            Coding Audit Platform
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <Input
            id="email"
            type="email"
            label="Email"
            autoFocus
            autoComplete="email"
            placeholder="you@hospital.th"
            error={errors.email?.message}
            {...register('email', {
              onChange: () => setSubmitError(null),
            })}
          />

          <Input
            id="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            error={errors.password?.message}
            {...register('password', {
              onChange: () => setSubmitError(null),
            })}
          />

          {submitError && (
            <p role="alert" className="text-[12px] font-semibold text-error">
              {submitError}
            </p>
          )}

          <Button type="submit" fullWidth disabled={isSubmitting}>
            Sign in
          </Button>
        </form>

        {/* demo credentials — click to pre-fill. Dev server only: a built image
            can't know the admin password set in .env, so there it would show
            a wrong one, or advertise the default on a real install. */}
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={fillDemoCredentials}
            className="mt-6 w-full rounded-lg border border-dashed border-border bg-bg p-3 text-left transition-colors hover:border-primary"
          >
            <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">
              Demo admin — click to fill
            </p>
            <p className="text-[12px] text-text">
              Email:{' '}
              <span className="font-semibold text-primary">{DEMO_EMAIL}</span>
            </p>
            <p className="text-[12px] text-text">
              Password:{' '}
              <span className="font-semibold text-primary">{DEMO_PASSWORD}</span>
            </p>
          </button>
        )}
      </Card>
    </main>
  )
}
