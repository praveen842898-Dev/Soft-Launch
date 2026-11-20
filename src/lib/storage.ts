import { PracticeTake, ProgressVerdict, UserProfile } from '../types/softlaunch';

const PROFILE_KEY = 'softlaunch_profile_v1';
const TAKES_KEY = 'softlaunch_takes_v1';
const VERDICT_KEY = 'softlaunch_verdict_v1';

const DB_NAME = 'softlaunch_videos_db';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

export function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    if (!parsed.niche || !parsed.goal) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadTakes(): PracticeTake[] {
  try {
    const raw = localStorage.getItem(TAKES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PracticeTake[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTakes(takes: PracticeTake[]): void {
  localStorage.setItem(TAKES_KEY, JSON.stringify(takes));
}

interface CachedVerdict {
  takeIdsSignature: string;
  verdict: ProgressVerdict;
}

export function loadCachedVerdict(takes: PracticeTake[]): ProgressVerdict | null {
  try {
    const raw = localStorage.getItem(VERDICT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedVerdict;
    const sig = takes.map((t) => t.id).join('|');
    if (parsed.takeIdsSignature === sig && parsed.verdict) {
      return parsed.verdict;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCachedVerdict(takes: PracticeTake[], verdict: ProgressVerdict): void {
  const payload: CachedVerdict = {
    takeIdsSignature: takes.map((t) => t.id).join('|'),
    verdict,
  };
  localStorage.setItem(VERDICT_KEY, JSON.stringify(payload));
}

export function clearCachedVerdict(): void {
  localStorage.removeItem(VERDICT_KEY);
}

function openVideoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVideoBlob(id: string, file: Blob): Promise<void> {
  try {
    const db = await openVideoDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Could not persist video locally in IndexedDB:', err);
  }
}

export async function getVideoBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openVideoDB();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

export async function deleteVideoBlob(id: string): Promise<void> {
  try {
    const db = await openVideoDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore cleanup failures
  }
}

export async function clearAllLocalData(): Promise<void> {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(TAKES_KEY);
  localStorage.removeItem(VERDICT_KEY);
  try {
    const db = await openVideoDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}
