'use client'

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      // Successful login - redirect based on role
      const response = await fetch('/api/auth/session');
      const session = await response.json();

      if (session?.user) {
        const role = session.user.role;
        if (role === 'SALES_TEAM' || role === 'CSS_ADMIN') {
          router.push('/dashboard');
        } else if (role === 'CLIENT_VIEWER' || role === 'CLIENT_ADMIN') {
          const retailerId = session.user.currentRetailerId || session.user.retailerIds?.[0];
          if (retailerId) {
            router.push(`/retailer/${retailerId}`);
          } else {
            setError('No retailer access configured');
            setLoading(false);
          }
        }
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1B1C1B] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image 
              src="/img/shareview_logo.png" 
              alt="ShareView" 
              width={512}
              height={128}
              priority
              className="h-24 w-auto"
            />
          </div>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B1C1B] focus:border-transparent"
                placeholder="Email or username"
                disabled={loading}
                autoFocus
                autoComplete="email"
              />
            </div>

            <div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B1C1B] focus:border-transparent"
                placeholder="Password"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-[#1B1C1B] text-white py-3 rounded-md font-medium hover:bg-[#2B2C2B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
