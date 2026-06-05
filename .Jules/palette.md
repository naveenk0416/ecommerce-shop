## 2026-06-05 - Keyboard Accessible Hover Interactions
**Learning:** Hover-revealed patterns (`opacity-0 group-hover:opacity-100`, `group-hover:translate-x-0`) must always be paired with focus-aware classes (`focus-within:opacity-100`, `focus-visible:opacity-100`, `focus-within:translate-x-0`) so that interactive elements remain visible and accessible during keyboard navigation.
**Action:** Ensure any future hover-revealed UI components implement corresponding `focus-visible` or `focus-within` states to maintain keyboard accessibility.
