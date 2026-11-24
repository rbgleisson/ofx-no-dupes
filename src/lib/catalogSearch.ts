/**
 * Busca compartilhada para cadastros (Categorias e Plano de Contas).
 * Compara ignorando acentos, maiúsculas/minúsculas e espaços nas pontas.
 * Todos os termos digitados precisam aparecer em algum dos campos.
 */

export const normalizeCatalogText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const matchesCatalogQuery = (
  query: string,
  fields: (string | null | undefined)[],
): boolean => {
  const q = normalizeCatalogText(query);
  if (!q) return true;
  const haystack = normalizeCatalogText(
    fields.filter((f): f is string => Boolean(f)).join(' '),
  );
  return q.split(/\s+/).every(term => haystack.includes(term));
};

export const filterCatalog = <T>(
  items: T[],
  query: string,
  getFields: (item: T) => (string | null | undefined)[],
): T[] => items.filter(item => matchesCatalogQuery(query, getFields(item)));
