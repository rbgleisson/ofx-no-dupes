import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, Check, X, Tag, Search } from 'lucide-react';
import { filterCatalog } from '@/lib/catalogSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface Category {
  id: string;
  name: string;
  color: string;
  code?: string | null;
  created_at: string;
}

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

interface CategoriesManagerProps {
  categories: Category[];
  onCategoriesChange: () => void;
}

const CategoriesManager = ({ categories, onCategoriesChange }: CategoriesManagerProps) => {
  const [open, setOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [query, setQuery] = useState('');

  const visible = filterCatalog(categories, query, cat => [cat.name, cat.code]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
    const { error } = await supabase.from('categories').insert({
      name: newName.trim(),
      color: newColor,
      code: newCode.trim() || null,
      user_id: user.id,
      organization_id: orgId,
    });
    if (!error) {
      setNewCode('');
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      onCategoriesChange();
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from('categories').update({
      name: editName.trim(),
      color: editColor,
      code: editCode.trim() || null,
    }).eq('id', id);
    if (!error) {
      setEditingId(null);
      onCategoriesChange();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (!error) onCategoriesChange();
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditCode(cat.code || '');
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setEditingId(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white border-0">
          <Tag className="w-4 h-4 mr-1.5" />
          Categorias
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Categorias</DialogTitle>
        </DialogHeader>

        {/* Add new */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Código"
            value={newCode}
            onChange={e => setNewCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="w-20 text-sm"
          />
          <Input
            placeholder="Nova categoria..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="flex-1 min-w-[9rem]"
          />
          <div className="flex gap-1 flex-shrink-0">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar categoria por nome ou código..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setEditingId(null);
            }}
            className="h-8 text-xs pl-7"
          />
        </div>

        {/* List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma categoria cadastrada.</p>
          )}
          {categories.length > 0 && visible.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma categoria encontrada para "{query.trim()}".
            </p>
          )}
          {query.trim() && categories.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {visible.length} de {categories.length} categoria{categories.length === 1 ? '' : 's'}
            </p>
          )}
          {visible.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              {editingId === cat.id ? (
                <>
                  <Input
                    value={editCode}
                    onChange={e => setEditCode(e.target.value)}
                    placeholder="Código"
                    className="w-20 h-8 text-sm"
                  />
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    onKeyDown={e => e.key === 'Enter' && handleUpdate(cat.id)}
                  />
                  <div className="flex gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        className={`w-4 h-4 rounded-full border-2 transition-all ${editColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button onClick={() => handleUpdate(cat.id)} className="text-[hsl(var(--success))] hover:opacity-80">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:opacity-80">
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  {cat.code && (
                    <span className="text-xs font-mono text-muted-foreground w-14 flex-shrink-0">{cat.code}</span>
                  )}
                  <span className="flex-1 text-sm font-medium text-foreground">{cat.name}</span>
                  <button onClick={() => startEdit(cat)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(cat.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CategoriesManager;
