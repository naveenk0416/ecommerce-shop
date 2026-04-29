## 2026-04-29 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** Icon-only buttons throughout the app (modals, actions, navigation) often lack `aria-label` attributes, making them inaccessible to screen reader users who cannot determine their function visually.
**Action:** Always ensure that any button containing only an icon has a descriptive `aria-label` attribute explaining its action.
