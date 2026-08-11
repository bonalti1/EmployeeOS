/**
 * AI assistant endpoint for Rolando's Dashboard.
 *
 * The browser sends a question plus a snapshot of Rolando's locally-stored data
 * (tasks, bills, calendar, health, family). We forward it to an LLM and return
 * a plain-language answer. The API key lives only here, in Netlify env vars —
 * it is never exposed to the browser.
 *
 * Provider is OpenAI today, but the call is isolated in `callOpenAI` so we can
 * add Anthropic/Claude or others later without touching the frontend.
 *
 * Required Netlify environment variable:
 *   OPENAI_API_KEY   – your OpenAI secret key
 * Optional:
 *   OPENAI_MODEL     – defaults to "gpt-4o-mini"
 */

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const SYSTEM_PROMPT = `You are the helpful assistant inside "Rolando's Dashboard", a personal life-management app.
You answer questions about Rolando's tasks, bills/payments, calendar, health logs, and family.
You are given a snapshot of his current data below each question. Use ONLY that data to answer.
Be warm, concise, and concrete. When he asks "when did I..." give the date(s) from the data.
If the answer isn't in the data, say so kindly and suggest where he could add it.
Format money and dates clearly. Never invent facts that aren't in the snapshot.`

async function callOpenAI(question: string, context: string, history: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw Object.assign(new Error('not_configured'), { code: 'not_configured' })
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-8),
    { role: 'user', content: `${question}\n\n--- MY DASHBOARD DATA ---\n${context || '(no data saved yet)'}` },
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 600 }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't come up with an answer."
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload: { question?: string; context?: string; history?: ChatMessage[] }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const question = (payload.question || '').trim()
  if (!question) return json({ error: 'Missing question' }, 400)

  try {
    const answer = await callOpenAI(question, payload.context || '', payload.history || [])
    return json({ answer })
  } catch (err) {
    const e = err as Error & { code?: string }
    if (e.code === 'not_configured') {
      return json({ error: 'not_configured', message: 'The AI key is not set up yet.' }, 200)
    }
    console.error('AI function error:', e.message)
    return json({ error: 'ai_error', message: 'The assistant had trouble responding.' }, 200)
  }
}
