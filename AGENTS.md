# Architecture Rules

- Persist every user-edited monthly opening balance in `monthly_opening_balances`, even when equal to the fallback; later months chain from that manual anchor using non-transfer transactions so each month starts with the prior month's subtotal.