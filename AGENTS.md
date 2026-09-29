# Architecture Rules

- Persist manual monthly opening balances in `monthly_opening_balances`; later months chain from the latest prior anchor using non-transfer transactions, preserving the legacy cash calculation only when no anchor exists.