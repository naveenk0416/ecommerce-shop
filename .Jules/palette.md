## 2024-06-19 - Hover-Revealed UI Keyboard Accessibility
**Learning:** When building interfaces with hover-revealed action buttons (e.g. `opacity-0 group-hover:opacity-100`), these actions become completely invisible and inaccessible to keyboard-only users who navigate via the Tab key.
**Action:** Always pair hover-revealed patterns with focus-aware utility classes like `focus-visible:opacity-100` or `group-focus-within:opacity-100` (along with any associated transform resets like `group-focus-within:translate-x-0`). This ensures that actions naturally appear when a user tabs into them.
