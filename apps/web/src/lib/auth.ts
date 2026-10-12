import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { prisma } from '@flowbridge/db'
import { compare } from 'bcryptjs'
import { z } from 'zod'

export const runtime = 'nodejs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials)

        if (!parsed.success) return null

        const { email, password } = parsed.data

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.password) return null

        const valid = await compare(password, user.password)
        if (!valid) return null

        // Get user's first workspace membership
        const member = await prisma.member.findFirst({
          where: { userId: user.id },
          include: { workspace: true },
        })

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          workspaceId: member?.workspaceId,
          workspaceSlug: member?.workspace.slug,
          role: member?.role,
        }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.workspaceId = (user as any).workspaceId
        token.workspaceSlug = (user as any).workspaceSlug
        token.role = (user as any).role
      }
      if (account?.provider === 'google') {
        // Handle Google OAuth - find or create user
        const existingUser = await prisma.user.findUnique({ where: { email: user.email! } })
        if (existingUser) {
          const member = await prisma.member.findFirst({
            where: { userId: existingUser.id },
            include: { workspace: true },
          })
          token.id = existingUser.id
          token.workspaceId = member?.workspaceId
          token.workspaceSlug = member?.workspace.slug
          token.role = member?.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.workspaceId = token.workspaceId as string
        session.user.workspaceSlug = token.workspaceSlug as string
        session.user.role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
})

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      workspaceId?: string
      workspaceSlug?: string
      role?: string
    }
  }
  interface User {
    workspaceId?: string
    workspaceSlug?: string
    role?: string
  }
  interface JWT {
    id: string
    workspaceId?: string
    workspaceSlug?: string
    role?: string
  }
}