import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageCompression';

const ATTACHMENTS_KEY = 'ofx_attachments';

interface AttachmentMap {
  [transactionId: string]: string; // transactionId -> public URL
}

function getAttachmentMap(): AttachmentMap {
  try {
    const data = localStorage.getItem(ATTACHMENTS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveAttachmentMap(map: AttachmentMap): void {
  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(map));
}

export function getAttachment(transactionId: string): string | null {
  return getAttachmentMap()[transactionId] || null;
}

export function getAllAttachments(): AttachmentMap {
  return getAttachmentMap();
}

/** Extrai o caminho interno do bucket a partir de uma URL salva. */
export function getStoragePath(url: string): string | null {
  const match = url.match(/transaction-docs\/(.+)$/);
  return match ? match[1] : null;
}

/** Organização do usuário logado — usada como primeira pasta do caminho. */
export async function getOrgFolder(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
  if (!data) throw new Error('No organization found');
  return data as string;
}

export async function uploadAttachment(transactionId: string, file: File): Promise<string> {
  // Compress images before upload (PDFs are left untouched)
  const processedFile = await compressImage(file);
  const ext = processedFile.name.split('.').pop() || 'bin';
  const orgId = await getOrgFolder();
  const path = `${orgId}/${transactionId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('transaction-docs')
    .upload(path, processedFile, { upsert: true });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage
    .from('transaction-docs')
    .getPublicUrl(path);

  const map = getAttachmentMap();
  map[transactionId] = data.publicUrl;
  saveAttachmentMap(map);

  return data.publicUrl;
}

/** Baixa o anexo pelo SDK autenticado e devolve um blob URL para exibição. */
export async function getAttachmentBlobUrl(url: string): Promise<string | null> {
  const path = getStoragePath(url);
  if (!path) return null;
  const { data, error } = await supabase.storage.from('transaction-docs').download(path);
  if (error || !data) return null;
  return URL.createObjectURL(data);
}


export async function removeAttachment(transactionId: string): Promise<void> {
  const map = getAttachmentMap();
  const url = map[transactionId];
  
  if (url) {
    // Extract path from URL
    const match = url.match(/transaction-docs\/(.+)$/);
    if (match) {
      await supabase.storage.from('transaction-docs').remove([match[1]]);
    }
    delete map[transactionId];
    saveAttachmentMap(map);
  }
}

export function clearAllAttachments(): void {
  localStorage.removeItem(ATTACHMENTS_KEY);
}
