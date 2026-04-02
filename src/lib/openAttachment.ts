import { supabase } from '@/integrations/supabase/client';

/**
 * Opens an attachment by downloading it through the Supabase SDK,
 * bypassing ad blockers that block direct Supabase URLs.
 */
export async function openAttachment(url: string): Promise<void> {
  // Extract the storage path from the URL
  const match = url.match(/transaction-docs\/(.+)$/);
  if (!match) {
    // Fallback: try opening directly
    window.open(url, '_blank');
    return;
  }

  const path = match[1];

  const { data, error } = await supabase.storage
    .from('transaction-docs')
    .download(path);

  if (error || !data) {
    // Fallback
    window.open(url, '_blank');
    return;
  }

  const blobUrl = URL.createObjectURL(data);
  window.open(blobUrl, '_blank');
}
