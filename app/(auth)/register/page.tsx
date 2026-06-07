// app/(auth)/register/page.tsx
import RegisterForm from '@/app/components/auth/RegisterForm'
import Link from 'next/link'

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-8">
          <Link
            href="/dashboard"
            className="text-4xl font-extrabold text-orange-600 tracking-tight hover:text-orange-700 transition-colors"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Bushal
          </Link>
          <p className="mt-2 text-slate-500 text-sm">Create your free account</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <RegisterForm />
          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-orange-600 font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400 px-4">
          By creating an account, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  )
}