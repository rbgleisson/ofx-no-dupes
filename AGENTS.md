# Architecture Rules
- Enforce month closure in database triggers for financial writes (both old and new periods) and use an organization-scoped RPC for closure/reopening; client controls are not security boundaries.
- Pay and reverse installments atomically through an authenticated RPC so a closed month cannot leave an orphan payment or partially reversed installment.

- Keep the bank-available closing separate from the org non-transfer subtotal; calculate only non-investment accounts with statement anchors through the selected period end and disclose statement/history differences rather than writing artificial adjustments — bank liquidity and operating cashflow are distinct.

- Persist every user-edited monthly opening balance in `monthly_opening_balances`, even when equal to the fallback; months without a saved value default to the bank-available balance at the prior month end (fetchMonthlyOpeningBalance, shared by screen, summary and Excel) — keeps the opening reconcilable with the banks.
- With an account filter, the main-screen block anchors on the latest bank statement balance (account_statement_balances, from OFX LEDGERBAL or manual) and sums all that account's transactions — keeps per-account balances reconcilable with the bank.
- Month Entradas/Saídas use splitMonthCashflow (src/lib/monthComposition.ts) everywhere on screen and summary; closures snapshot month balance via close_month_with_snapshot RPC — one rule prevents card/summary drift.
