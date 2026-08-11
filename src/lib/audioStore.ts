/**
 * IndexedDB wrapper for journal voice recordings, with optional cloud backup.
 *
 * Audio blobs are far too large for localStorage (which holds the text
 * metadata), so the recordings live here, keyed by the journal entry id. When
 * Supabase is configured and signed in, each recording is also uploaded to a
 * private Storage bucket and pulled back on demand — so a note recorded on your
 * phone plays back on your computer. IndexedDB stays the fast local cache.
 */
import { supabase } from './supabase'
import { currentUserId } from './cloud'

const DB_NAME = 'rjp-journal'
const STORE = 'audio'
const VERSION = 1
const BUCKET = 'journal-audio'

const remotePath = (id: string): string | null => {
  const uid = currentUserId()
  return uid ? `${uid}/${id}` : null
}
async function uploadRemote(id: string, blob: Blob): Promise<void> {
  if (!supabase) return
  const path = remotePath(id); if (!path) return
  try { await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'audio/webm' }) } catch { /* offline / not configured */ }
}
async function downloadRemote(id: string): Promise<Blob | null> {
  if (!supabase) return null
  const path = remotePath(id); if (!path) return null
  try { const { data } = await supabase.storage.from(BUCKET).download(path); return data ?? null } catch { return null }
}
async function deleteRemote(id: string): Promise<void> {
  if (!supabase) return
  const path = remotePath(id); if (!path) return
  try { await supabase.storage.from(BUCKET).remove([path]) } catch { /* ignore */ }
}

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

export async function putAudio(id: string, blob: Blob): Promise<void> {
  await putLocal(id, blob)
  void uploadRemote(id, blob) // best-effort cloud backup
}

export async function getAudio(id: string): Promise<Blob | null> {
  const local = await getLocal(id)
  if (local) return local
  // Not on this device — try the cloud, then cache it locally for next time.
  const remote = await downloadRemote(id)
  if (remote) { try { await putLocal(id, remote) } catch { /* ignore cache failure */ } return remote }
  return null
}

export async function delAudio(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
  void deleteRemote(id)
}
