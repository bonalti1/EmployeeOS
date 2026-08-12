/**
 * Brand photo library — the real work, kept permanently.
 *
 * Photos of homes actually built are the best raw material an ad can have, so
 * they live in shared storage (the same member-only `workspace-audio` bucket
 * the journal uses, under a `photos/<brand>/` prefix) rather than being
 * re-uploaded each time. Anyone in the workspace can add to the library and
 * every ad creative can be built from it.
 */
import { supabase } from './supabase'

const BUCKET = 'workspace-audio'
const folder = (brand: string) => `photos/${brand.toLowerCase()}`

export type WsPhoto = { name: string; path: string; url: string }

/** Downscale before upload — ad renders don't need more than ~1600px. */
export async function toUploadBlob(file: Blob, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.9))
}

export async function listPhotos(brand: string): Promise<WsPhoto[]> {
  if (!supabase) return []
  const { data, error } = await supabase.storage.from(BUCKET).list(folder(brand), {
    limit: 200, sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error || !data) return []
  const files = data.filter((f) => f.name && !f.name.startsWith('.'))
  const out: WsPhoto[] = []
  for (const f of files) {
    const path = `${folder(brand)}/${f.name}`
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 8)
    if (signed?.signedUrl) out.push({ name: f.name, path, url: signed.signedUrl })
  }
  return out
}

export async function addPhoto(brand: string, file: File): Promise<boolean> {
  if (!supabase) return false
  const blob = await toUploadBlob(file)
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-40) || 'photo.jpg'
  const path = `${folder(brand)}/${Date.now()}-${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg', upsert: false,
  })
  return !error
}

export async function removePhoto(path: string): Promise<void> {
  if (!supabase) return
  await supabase.storage.from(BUCKET).remove([path])
}

/** Signed URL → data URL, which is what the image edit endpoint needs. */
export async function photoToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
