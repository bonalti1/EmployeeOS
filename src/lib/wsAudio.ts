/**
 * Voice recordings for the shared workspace journal.
 *
 * Mirrors lib/audioStore.ts (the private journal), with one deliberate
 * difference: recordings go to a SHARED bucket under a `journal/` prefix so
 * Rolando can listen to Carlos's daily recap. The private journal-audio bucket
 * stays locked to each user's own folder and is untouched by this module.
 *
 * IndexedDB is the fast local cache; Supabase Storage is the source of truth
 * so a recap recorded on a phone plays back on a laptop.
 */
import { supabase } from './supabase'

const DB_NAME = 'rjp-ws-journal'
const STORE = 'audio'
const VERSION = 1
const BUCKET = 'workspace-audio'

const remotePath = (id: string) => `journal/${id}`

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putLocal(id: string, blob: Blob): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function getLocal(id: string): Promise<Blob | null> {
  const db = await openDB()
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return blob
}

/**
 * Save a recording. The upload is awaited (not fire-and-forget) so the caller
 * only marks an entry as having audio once it's actually in the cloud — a
 * recap that never uploaded would be invisible to the owner.
 */
export async function putWsAudio(id: string, blob: Blob): Promise<boolean> {
  try { await putLocal(id, blob) } catch { /* cache is best-effort */ }
  if (!supabase) return false
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(remotePath(id), blob, { upsert: true, contentType: blob.type || 'audio/webm' })
  return !error
}

export async function getWsAudio(id: string): Promise<Blob | null> {
  const local = await getLocal(id)
  if (local) return local
  if (!supabase) return null
  try {
    const { data } = await supabase.storage.from(BUCKET).download(remotePath(id))
    if (data) { try { await putLocal(id, data) } catch { /* ignore */ } return data }
  } catch { /* offline */ }
  return null
}

export async function delWsAudio(id: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch { /* ignore */ }
  if (supabase) { try { await supabase.storage.from(BUCKET).remove([remotePath(id)]) } catch { /* ignore */ } }
}
