import { useCallback, useState } from 'react';
import { Upload, FileText } from 'lucide-react';

interface FileDropzoneProps {
  onFileSelect: (content: string, fileName: string) => void;
}

const FileDropzone = ({ onFileSelect }: FileDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileSelect(content, file.name);
    };
    reader.readAsText(file);
  }, [onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12
        transition-all duration-300 cursor-pointer group
        ${isDragging
          ? 'border-primary bg-primary/5 scale-[1.02]'
          : 'border-border hover:border-primary/40 hover:bg-muted/50'
        }
      `}
    >
      <input
        type="file"
        accept=".ofx,.qfx"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className={`
        rounded-2xl p-4 transition-all duration-300
        ${isDragging ? 'bg-primary/10' : 'bg-muted group-hover:bg-primary/5'}
      `}>
        {isDragging ? (
          <FileText className="w-8 h-8 text-primary" />
        ) : (
          <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-foreground">
          {isDragging ? 'Solte o arquivo aqui' : 'Arraste seu arquivo OFX aqui'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          ou clique para selecionar
        </p>
      </div>
    </div>
  );
};

export default FileDropzone;
