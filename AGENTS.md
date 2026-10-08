# Architecture Rules

- Keep the bank-available closing separate from the org non-transfer subtotal; calculate only non-investment accounts with statement anchors through the selected period end and disclose statement/history differences rather than writing artificial adjustments — bank liquidity and operating cashflow are distinct.

- Persist every user-edited monthly opening balance in `monthly_opening_balances`, even when equal to the fallback; later months chain from that manual anchor using non-transfer transactions so each month starts with the prior month's subtotal.- With an account filter, the main-screen block anchors on the latest bank statement balance (account_statement_balances, from OFX LEDGERBAL or manual) and sums all that account's transactions; without a filter the org-wide chained rule stays unchanged — keeps per-account balances reconcilable with the bank.
