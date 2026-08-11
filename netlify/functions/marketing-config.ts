/**
 * Marketing Studio — capability probe. Tells the (authenticated) client which
 * providers are configured, without leaking any key material.
 */
import { json, authenticate, marketingModel } from '../lib/mktShared'

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await authenticate(req)
  if (auth instanceof Response) return auth

  return json({
    textConfigured: !!process.env.OPENAI_API_KEY,
    imageConfigured: !!process.env.OPENAI_API_KEY,
    videoConfigured: !!(process.env.MARKETING_VIDEO_PROVIDER || '').trim(),
    videoProvider: (process.env.MARKETING_VIDEO_PROVIDER || '').trim() || null,
    textModel: marketingModel(),
    imageModel: process.env.MARKETING_IMAGE_MODEL || 'gpt-image-1',
    role: auth.role,
    canGeneratePaidMedia: auth.canGeneratePaidMedia,
  })
}
