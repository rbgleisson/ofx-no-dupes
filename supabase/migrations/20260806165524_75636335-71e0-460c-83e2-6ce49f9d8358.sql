update public.transactions
set is_transfer = true
where is_transfer is distinct from true
  and (
    upper(coalesce(memo,'')) like '%MESMA TIT%'
    or upper(coalesce(description,'')) like '%MESMA TIT%'
    or upper(coalesce(memo,'')) like '%MESMA TITULARIDADE%'
    or upper(coalesce(description,'')) like '%MESMA TITULARIDADE%'
  );