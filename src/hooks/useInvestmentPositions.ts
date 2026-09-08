import { useCallback, useEffect, useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import {
  balanceMap,
  fetchOrgPositions,
  type InvestmentPosition,
} from '@/lib/investmentPositions';

/** Carrega as posições mensais das aplicações da organização logada. */
export function useInvestmentPositions() {
  const { organizationId } = useOrganization();
  const [positions, setPositions] = useState<InvestmentPosition[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!organizationId) {
      setPositions([]);
      return;
    }
    setLoading(true);
    try {
      setPositions(await fetchOrgPositions(organizationId));
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { reload(); }, [reload]);

  return { positions, balances: balanceMap(positions), loading, reload };
}
