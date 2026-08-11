/**
 * Reports which server-side integrations are configured, as booleans only —
 * never the key values. Lets the Settings → Integrations panel show live status.
 */
export default async (): Promise<Response> =>
  new Response(
    JSON.stringify({
      openai: !!process.env.OPENAI_API_KEY,
      plaid: !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET,
      googleCalendar: !!process.env.GOOGLE_CLIENT_ID,
      push: !!process.env.VAPID_PUBLIC_KEY,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
