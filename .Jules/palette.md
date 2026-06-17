## 2024-06-17 - Keyboard Accessibility for Hover-Revealed UI Actions
**Learning:** Actions hidden via `opacity-0 group-hover:opacity-100` are inaccessible to keyboard users because they cannot hover, causing interactive elements to remain invisible even when focused or tabbed to.
**Action:** Always append focus-aware classes like `group-focus-within:opacity-100 focus-within:opacity-100 focus-visible:opacity-100` (and `group-focus-within:translate-x-0 focus-within:translate-x-0` if translated) to hover-revealed patterns so they are fully accessible during keyboard navigation.
