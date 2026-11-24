import { describe, expect, it } from 'vitest';
import { filterCatalog, matchesCatalogQuery, normalizeCatalogText } from '@/lib/catalogSearch';

interface Row {
  id: string;
  code?: string | null;
  name: string;
}

const rows: Row[] = [
  { id: '1', code: '3.1.01', name: 'Dízimos' },
  { id: '2', code: '3.1.02', name: 'Oferta de Aço' },
  { id: '3', code: '5.2.10', name: 'Água e Luz' },
  { id: '4', code: null, name: 'Combustível Siena' },
];

const names = (items: Row[]) => items.map(r => r.name);

describe('normalizeCatalogText', () => {
  it('remove acentos e diferenciar maiúsculas', () => {
    expect(normalizeCatalogText('  ÁGUA E LUZ ')).toBe('agua e luz');
    expect(normalizeCatalogText('Dízimos')).toBe('dizimos');
  });
});

describe('matchesCatalogQuery', () => {
  it('busca pelo nome sem acento', () => {
    expect(matchesCatalogQuery('dizi', ['Dízimos', null])).toBe(true);
    expect(matchesCatalogQuery('DIZ', ['dízimos', null])).toBe(true);
  });
  it('busca pelo código', () => {
    expect(matchesCatalogQuery('5.2', ['Água e Luz', '5.2.10'])).toBe(true);
    expect(matchesCatalogQuery('5.2.10', ['Água e Luz', '5.2.10'])).toBe(true);
    expect(matchesCatalogQuery('5.2.11', ['Água e Luz', '5.2.10'])).toBe(false);
  });
  it('exige todos os termos digitados', () => {
    expect(matchesCatalogQuery('siena combu', ['Combustível Siena', null])).toBe(true);
    expect(matchesCatalogQuery('siena aluguel', ['Combustível Siena', null])).toBe(false);
  });
  it('consulta vazia não filtra nada', () => {
    expect(matchesCatalogQuery('', ['Dízimos', '3.1.01'])).toBe(true);
    expect(matchesCatalogQuery('   ', ['Dízimos', '3.1.01'])).toBe(true);
  });
});

describe('filterCatalog', () => {
  it('retorna só as categorias que batem com a consulta', () => {
    expect(names(filterCatalog(rows, 'oferta', r => [r.name, r.code]))).toEqual(['Oferta de Aço']);
    expect(names(filterCatalog(rows, '3.1', r => [r.name, r.code]))).toEqual(['Dízimos', 'Oferta de Aço']);
  });
  it('ignora código ausente', () => {
    expect(names(filterCatalog(rows, 'combustivel', r => [r.name, r.code]))).toEqual(['Combustível Siena']);
  });
  it('volta à lista toda quando a consulta é apagada', () => {
    expect(filterCatalog(rows, '', r => [r.name, r.code])).toHaveLength(4);
  });
  it('não encontra nada para um termo inexistente', () => {
    expect(filterCatalog(rows, 'aluguel', r => [r.name, r.code])).toEqual([]);
  });
});
