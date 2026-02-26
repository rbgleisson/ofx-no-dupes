import { TransactionFilters as Filters } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterX, Search } from 'lucide-react';

interface TransactionFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: Category[];
  accounts: Account[];
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

const TransactionFiltersComponent = ({ filters, onChange, categories, accounts }: TransactionFiltersProps) => {
  const days = filters.month && filters.year
    ? Array.from({ length: new Date(filters.year, filters.month, 0).getDate() }, (_, i) => i + 1)
    : Array.from({ length: 31 }, (_, i) => i + 1);

  const hasFilters = filters.year || filters.month || filters.day || filters.category_id || filters.account_id || filters.search;

  return (
    <div className="hidden md:flex items-center gap-2 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar descrição ou valor..."
          value={filters.search || ''}
          onChange={e => onChange({ ...filters, search: e.target.value || undefined })}
          className="h-8 w-48 text-xs pl-7"
        />
      </div>
      <Select
        value={filters.year?.toString() || '__all__'}
        onValueChange={v => onChange({ ...filters, year: v === '__all__' ? undefined : Number(v), month: v === '__all__' ? undefined : filters.month, day: v === '__all__' ? undefined : filters.day })}
      >
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos anos</SelectItem>
          {YEARS.map(y => (
            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.month?.toString() || '__all__'}
        onValueChange={v => onChange({ ...filters, month: v === '__all__' ? undefined : Number(v), day: v === '__all__' ? undefined : filters.day })}
        disabled={!filters.year}
      >
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos meses</SelectItem>
          {MONTHS.map((m, i) => (
            <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.day?.toString() || '__all__'}
        onValueChange={v => onChange({ ...filters, day: v === '__all__' ? undefined : Number(v) })}
        disabled={!filters.month}
      >
        <SelectTrigger className="h-8 w-24 text-xs">
          <SelectValue placeholder="Dia" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos dias</SelectItem>
          {days.map(d => (
            <SelectItem key={d} value={d.toString()}>{d.toString().padStart(2, '0')}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.category_id || '__all__'}
        onValueChange={v => onChange({ ...filters, category_id: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todas categorias</SelectItem>
          {categories.map(c => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                {c.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.account_id || '__all__'}
        onValueChange={v => onChange({ ...filters, account_id: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="Conta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todas contas</SelectItem>
          {accounts.map(a => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                {a.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onChange({})}>
          <FilterX className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
};

export default TransactionFiltersComponent;
