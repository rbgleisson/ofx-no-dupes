import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const showOpenError = () => toast.error('Não foi possível abrir o anexo');

/**
 * Opens an attachment by downloading it through the Supabase SDK,
 * bypassing ad blockers that block direct Supabase URLs.
 */
export async function openAttachment(url: string): Promise<void> {
  // Extract the storage path from the URL
  const match = url.match(/transaction-docs\/(.+)$/);
  if (!match) {
    showOpenError();
    return;
  }

  const path = match[1];
  // Open synchronously while the click gesture is still active. Browsers can
  // block a tab created only after the authenticated download has completed.
  const attachmentWindow = window.open('', '_blank');
  if (!attachmentWindow) {
    showOpenError();
    return;
  }
  attachmentWindow.document.title = 'Abrindo anexo...';
  attachmentWindow.document.body.textContent = 'Abrindo anexo...';

  const { data, error } = await supabase.storage
    .from('transaction-docs')
    .download(path);

  if (error || !data) {
    attachmentWindow.close();
    showOpenError();
    return;
  }

  const blobUrl = URL.createObjectURL(data);
  attachmentWindow.document.body.textContent = '';
  attachmentWindow.document.body.style.margin = '0';
  const viewer = attachmentWindow.document.createElement('iframe');
  viewer.src = blobUrl;
  viewer.title = 'Anexo';
  viewer.style.width = '100vw';
  viewer.style.height = '100vh';
  viewer.style.border = '0';
  attachmentWindow.document.body.appendChild(viewer);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
