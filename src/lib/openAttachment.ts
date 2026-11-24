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
  // Navigate the tab straight to the file: mobile browsers do not render
  // PDFs/images inside an iframe written into a blank popup.
  attachmentWindow.location.href = blobUrl;
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
