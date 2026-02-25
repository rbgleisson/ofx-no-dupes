import { TransactionFilters as Filters } from '@/lib/transactionStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FilterX } from 'lucide-react';

interface TransactionFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

const TransactionFiltersComponent = ({ filters, onChange }: TransactionFiltersProps) => {
  const days = filters.month && filters.year
    ? Array.from({ length: new Date(filters.year, filters.month, 0).getDate() }, (_, i) => i + 1)
    : Array.from({ length: 31 }, (_, i) => i + 1);

  const hasFilters = filters.year || filters.month || filters.day;

  return (
    <div className="flex items-center gap-2 flex-wrap">
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

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onChange({})}>
          <FilterX className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
};

export default TransactionFiltersComponent;
