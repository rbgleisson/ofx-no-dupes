const CATEGORY_MAP_KEY = 'ofx_transaction_categories';

interface CategoryMap {
  [transactionId: string]: string; // transactionId -> category id
}

function getCategoryMap(): CategoryMap {
  try {
    const data = localStorage.getItem(CATEGORY_MAP_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveCategoryMap(map: CategoryMap): void {
  localStorage.setItem(CATEGORY_MAP_KEY, JSON.stringify(map));
}

export function getAllTransactionCategories(): CategoryMap {
  return getCategoryMap();
}

export function setTransactionCategory(transactionId: string, categoryId: string): void {
  const map = getCategoryMap();
  map[transactionId] = categoryId;
  saveCategoryMap(map);
}

export function removeTransactionCategory(transactionId: string): void {
  const map = getCategoryMap();
  delete map[transactionId];
  saveCategoryMap(map);
}

export function clearAllTransactionCategories(): void {
  localStorage.removeItem(CATEGORY_MAP_KEY);
}
