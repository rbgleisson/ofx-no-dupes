import { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crop, Maximize, Square, FileText } from 'lucide-react';

interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onCropComplete: (croppedFile: File) => void;
  fileName: string;
}

type AspectMode = 'free' | '1:1' | '3:4' | 'a4';

const ASPECT_OPTIONS: { mode: AspectMode; label: string; icon: React.ReactNode; ratio?: number }[] = [
  { mode: 'free', label: 'Livre', icon: <Crop className="w-3.5 h-3.5" /> },
  { mode: '1:1', label: '1:1', icon: <Square className="w-3.5 h-3.5" />, ratio: 1 },
  { mode: '3:4', label: '3:4', icon: <Maximize className="w-3.5 h-3.5" />, ratio: 3 / 4 },
  { mode: 'a4', label: 'A4', icon: <FileText className="w-3.5 h-3.5" />, ratio: 210 / 297 },
];

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = url;
  });
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area, fileName: string): Promise<File> {
  console.log('[ImageCrop] getCroppedImg called');
  const image = await createImage(imageSrc);
  console.log('[ImageCrop] Image loaded:', image.width, image.height);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Canvas context not available');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      console.log('[ImageCrop] toBlob result:', blob?.size);
      if (blob) {
        const ext = fileName.split('.').pop() || 'jpg';
        const name = fileName.replace(/\.[^.]+$/, '') + '_cropped.' + ext;
        resolve(new File([blob], name, { type: blob.type }));
      } else {
        reject(new Error('Canvas toBlob returned null'));
      }
    }, 'image/jpeg', 0.92);
  });
}

const ImageCropDialog = ({ open, onOpenChange, imageSrc, onCropComplete, fileName }: ImageCropDialogProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectMode, setAspectMode] = useState<AspectMode>('free');
  const [isSaving, setIsSaving] = useState(false);

  const onCropCompleteHandler = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setIsSaving(true);
    try {
      console.log('[ImageCrop] handleSave start, pixels:', JSON.stringify(croppedAreaPixels));
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, fileName);
      console.log('[ImageCrop] Crop done, file size:', croppedFile.size);
      onCropComplete(croppedFile);
      console.log('[ImageCrop] onCropComplete called, closing dialog');
      onOpenChange(false);
      console.log('[ImageCrop] Dialog closed');
    } catch (err) {
      console.error('[ImageCrop] Error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const currentAspect = ASPECT_OPTIONS.find(o => o.mode === aspectMode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-sm">Recortar imagem</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 justify-center mb-2">
          {ASPECT_OPTIONS.map(opt => (
            <Button
              key={opt.mode}
              type="button"
              size="sm"
              variant={aspectMode === opt.mode ? 'default' : 'outline'}
              className="text-xs gap-1 h-7 px-2"
              onClick={() => setAspectMode(opt.mode)}
            >
              {opt.icon}
              {opt.label}
            </Button>
          ))}
        </div>

        <div className="relative w-full h-[350px] bg-muted rounded-lg overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={currentAspect?.ratio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteHandler}
          />
        </div>

        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-1 accent-primary"
          />
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Recortando...' : 'Usar recorte'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropDialog;
