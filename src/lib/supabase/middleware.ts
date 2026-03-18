import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  console.log(`[PROXY] ${request.method} ${path} | user=${user?.email ?? 'NONE'}`);

  // Redirect unauthenticated users to login (except for login page, API routes, and contractor routes)
  const isLoginPage = path === '/login';
  const isSignupPage = path === '/signup';
  const isApiRoute = path.startsWith('/api');
  const isContractorRoute = path.startsWith('/contractor');

  if (!user && !isLoginPage && !isSignupPage && !isApiRoute && !isContractorRoute) {
    console.log(`[PROXY] → REDIRECT to /login (no user)`);
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && isLoginPage) {
    console.log(`[PROXY] → REDIRECT to /dashboard (already logged in)`);
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
