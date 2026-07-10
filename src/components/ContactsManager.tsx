import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, Check, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Category } from '@/components/CategoriesManager';
import { toast } from 'sonner';

export interface Contact {
  id: string;
  nome: string;
  documento: string;
  documento_digits: string;
  categoria_id: string | null;
  organization_id: string | null;
  created_at: string;
}

const onlyDigits = (v: string) => (v || '').replace(/\D/g, '');

export function maskCpfCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    // CPF: 000.000.000-00
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  // CNPJ: 00.000.000/0000-00
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

interface Props {
  categories: Category[];
  onChange?: () => void;
}

export async function fetchContacts(organizationId: string | null): Promise<Contact[]> {
  if (!organizationId) return [];
  const { data, error } = await (supabase as any)
    .from('contatos_recorrentes')
    .select('*')
    .eq('organization_id', organizationId)
    .order('nome', { ascending: true });
  if (error) {
    console.error('fetchContacts', error);
    return [];
  }
  return (data || []) as Contact[];
}

const ContactsManager = ({ categories, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Contact[]>([]);
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [categoriaId, setCategoriaId] = useState<string>('__none__');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editDoc, setEditDoc] = useState('');
  const [editCat, setEditCat] = useState<string>('__none__');

  const reload = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
    const list = await fetchContacts(orgId as any);
    setItems(list);
  };

  useEffect(() => {
    if (open) reload();
  }, [open]);

  const handleAdd = async () => {
    if (!nome.trim() || onlyDigits(documento).length < 11) {
      toast.error('Informe nome e um CPF/CNPJ válido');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
    const { error } = await (supabase as any).from('contatos_recorrentes').insert({
      nome: nome.trim(),
      documento: documento.trim(),
      categoria_id: categoriaId === '__none__' ? null : categoriaId,
      user_id: user.id,
      organization_id: orgId,
    });
    if (error) {
      toast.error('Erro ao salvar contato');
      return;
    }
    setNome(''); setDocumento(''); setCategoriaId('__none__');
    await reload();
    onChange?.();
  };

  const startEdit = (c: Contact) => {
    setEditingId(c.id);
    setEditNome(c.nome);
    setEditDoc(c.documento);
    setEditCat(c.categoria_id || '__none__');
  };

  const handleUpdate = async (id: string) => {
    if (!editNome.trim() || onlyDigits(editDoc).length < 11) {
      toast.error('Informe nome e um CPF/CNPJ válido');
      return;
    }
    const { error } = await (supabase as any).from('contatos_recorrentes').update({
      nome: editNome.trim(),
      documento: editDoc.trim(),
      categoria_id: editCat === '__none__' ? null : editCat,
    }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    setEditingId(null);
    await reload();
    onChange?.();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este contato?')) return;
    const { error } = await (supabase as any).from('contatos_recorrentes').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    await reload();
    onChange?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white border-0">
          <Users className="w-4 h-4 mr-1.5" />
          Favorecidos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Favorecidos / Contatos</DialogTitle>
          <DialogDescription>
            Cadastre contatos recorrentes para identificar automaticamente débitos PIX na importação de OFX.
          </DialogDescription>
        </DialogHeader>

        {/* Add form */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-2 items-end border-b pb-3">
          <div>
            <label className="text-xs text-muted-foreground">Nome completo</label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João da Silva" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">CPF ou CNPJ</label>
            <Input
              value={documento}
              onChange={e => setDocumento(maskCpfCnpj(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Categoria padrão</label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem categoria</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} size="sm"><Plus className="w-4 h-4 mr-1" />Adicionar</Button>
        </div>

        {/* List */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum contato cadastrado.</p>
          )}
          {items.map(c => {
            const cat = categories.find(x => x.id === c.categoria_id);
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} className="rounded-lg border p-2">
                {isEditing ? (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px_auto] gap-2 items-center">
                    <Input value={editNome} onChange={e => setEditNome(e.target.value)} className="h-8 text-sm" />
                    <Input value={editDoc} onChange={e => setEditDoc(maskCpfCnpj(e.target.value))} className="h-8 text-sm" />
                    <Select value={editCat} onValueChange={setEditCat}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem categoria</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      <button onClick={() => handleUpdate(c.id)} className="text-emerald-600"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.nome}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c.documento}</p>
                    </div>
                    {cat && (
                      <span className="text-xs flex items-center gap-1.5 px-2 py-0.5 rounded-full border">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </span>
                    )}
                    <button onClick={() => startEdit(c)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactsManager;
