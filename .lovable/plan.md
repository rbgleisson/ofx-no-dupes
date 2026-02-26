
# Plano de Correção: Dialog Mobile + Filtro Mês Atual

## Problemas Identificados

1. **Dialog fecha no mobile**: O overlay manual (`div` com `onClick`) interfere no toque em mobile, fechando o dialog imediatamente ao abrir.
2. **Lançamentos não aparecem na listagem**: Os filtros iniciam vazios (`{}`), carregando todos os dados sem filtro de mês. Com o filtro padrão do mês atual, os lançamentos novos aparecerão corretamente.
3. **Mês atual como padrão**: O sistema não filtra pelo mês corrente ao iniciar.

## Solução

### 1. Corrigir dialog no mobile (`TransactionFormDialog.tsx`)
- Remover o overlay manual (`div` com `onClick`) que causa conflito de toque no mobile.
- Voltar a usar `modal={true}` (padrão) no Dialog.
- Para resolver o problema dos dropdowns (Select/Popover) dentro do dialog, usar a prop `modal={false}` nos Popovers internos ou adicionar `pointer-events-auto` nos portals dos selects.

### 2. Filtro padrão para mês atual (`Index.tsx`)
- Alterar o estado inicial de `filters` para incluir `year` e `month` do mês corrente:
  ```
  const now = new Date();
  const [filters, setFilters] = useState<TransactionFilters>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  ```
- Isso garante que ao abrir o sistema, apenas os lançamentos do mês atual são exibidos.
- O usuário continua podendo mudar o mês/ano pelos filtros existentes.

### Detalhes Técnicos

**Arquivo `src/components/TransactionFormDialog.tsx`:**
- Restaurar `<Dialog open={open} onOpenChange={onOpenChange}>` (sem `modal={false}`)
- Remover a `div` de overlay manual
- Manter `max-h-[90vh] overflow-y-auto` no `DialogContent`

**Arquivo `src/pages/Index.tsx`:**
- Linha 35: mudar inicialização de `filters` para incluir ano e mês atuais
