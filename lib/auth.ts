// NextAuth.js v5 configuration for ShareView Platform
// Handles authentication with email/password using Credentials provider

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { query } from './db';
import { logActivity, logFailedLogin } from './activity-logger';
import './env'; // Validate environment variables

// Dynamic import of bcrypt to avoid Edge Runtime issues
const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const bcrypt = await import('bcrypt');
  return bcrypt.compare(password, hash);
};

const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email or Username', type: 'text', placeholder: 'Enter your email or username' },
        password: { label: 'Password', type: 'password', placeholder: 'Enter your password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        try {
          // Query user by email or username
          const userResult = await query(
            `SELECT id, email, username, password_hash, full_name, role, is_active 
             FROM users 
             WHERE (email = $1 OR username = $1) AND is_active = true`,
            [email]
          );

          if (userResult.rows.length === 0) {
            // User not found or inactive
            await logFailedLogin(email);
            return null;
          }

          const user = userResult.rows[0];

          // Verify password using bcrypt
          const isPasswordValid = await verifyPassword(password, user.password_hash);

          if (!isPasswordValid) {
            // Invalid password
            await logFailedLogin(email);
            return null;
          }

          // Get accessible retailers for CLIENT roles
          let retailerIds: string[] = [];
          if (user.role === 'CLIENT_VIEWER' || user.role === 'CLIENT_ADMIN') {
            const accessResult = await query(
              `SELECT retailer_id FROM user_retailer_access WHERE user_id = $1`,
              [user.id]
            );
            retailerIds = accessResult.rows.map((row: any) => row.retailer_id);
          }

          // Update last login timestamp
          await query(
            `UPDATE users SET last_login = NOW() WHERE id = $1`,
            [user.id]
          );

          // Log successful login
          await logActivity({
            userId: user.id,
            action: 'login',
            details: { email: user.email, role: user.role },
          });

          // Return user object for JWT
          return {
            id: user.id.toString(),
            email: user.email,
            name: user.full_name,
            role: user.role,
            retailerIds,
          };
        } catch (error) {
          console.error('Authorization error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Add custom fields to JWT token on initial sign in
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.email = user.email;
        token.retailerIds = user.retailerIds;
        
        // Set initial currentRetailerId for CLIENT roles
        if ((user.role === 'CLIENT_VIEWER' || user.role === 'CLIENT_ADMIN') && user.retailerIds && user.retailerIds.length > 0) {
          token.currentRetailerId = user.retailerIds[0];
        } else {
          token.currentRetailerId = undefined;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Add custom fields to session from JWT token
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as any;
        session.user.email = token.email as string;
        session.user.retailerIds = token.retailerIds as string[] | undefined;
        session.user.currentRetailerId = token.currentRetailerId as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
});

// Export handlers and auth functions
const { GET, POST } = handlers;
export { GET, POST, auth, signIn, signOut };
