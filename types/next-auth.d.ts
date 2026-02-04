// NextAuth.js type extensions for custom session properties

import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: 'CLIENT_VIEWER' | 'CLIENT_ADMIN' | 'SALES_TEAM' | 'CSS_ADMIN';
      currentRetailerId?: string;
      retailerIds?: string[];
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: 'CLIENT_VIEWER' | 'CLIENT_ADMIN' | 'SALES_TEAM' | 'CSS_ADMIN';
    retailerIds?: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    role: 'CLIENT_VIEWER' | 'CLIENT_ADMIN' | 'SALES_TEAM' | 'CSS_ADMIN';
    email: string;
    retailerIds?: string[];
    currentRetailerId?: string;
  }
}
