import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { loginUser } from '../api/authService'
import { useAuth } from '../hooks/useAuth'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../types/auth.types'
import { loginSchema, type LoginFormValues } from '../types/login.schema'

export function LoginForm() {
  const navigate = useNavigate()
  const { setAuthToken } = useAuth()
  const [submitError, setSubmitError] = useState(false)

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

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(false)

    try {
      // Placeholder — role-based redirect comes when auth API is ready
      const response = await loginUser(values)
      setAuthToken(response.token || 'dev-token')
      navigate('/admin/dashboard', { replace: true })
    } catch {
      setSubmitError(true)
    }
  }

  const fillDemoCredentials = () => {
    setValue('email', DEMO_EMAIL, { shouldValidate: true })
    setValue('password', DEMO_PASSWORD, { shouldValidate: true })
    setSubmitError(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm">
        {/* brand */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <ShieldCheck size={34} className="text-primary" />
          <h1 className="text-[20px] font-bold text-text">MedCode AI</h1>
          <p className="text-[12px] font-semibold text-primary">
            SuperAdmin Portal
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
            placeholder="admin@hospital.th"
            error={errors.email?.message}
            {...register('email', {
              onChange: () => setSubmitError(false),
            })}
          />

          <Input
            id="password"
            type="password"
            label="Password"
            placeholder="••••••••••••"
            error={errors.password?.message}
            {...register('password', {
              onChange: () => setSubmitError(false),
            })}
          />

          {submitError && (
            <p className="text-[12px] font-semibold text-error">
              Invalid credentials
            </p>
          )}

          <Button type="submit" fullWidth disabled={isSubmitting}>
            Sign in as SuperAdmin
          </Button>
        </form>

        {/* demo credentials — click to pre-fill */}
        <button
          type="button"
          onClick={fillDemoCredentials}
          className="mt-6 w-full rounded-lg border border-dashed border-border bg-bg p-3 text-left transition-colors hover:border-primary"
        >
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
            Demo account — click to fill
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
      </Card>
    </div>
  )
}
