## 2026-07-03 - Keyboard Accessibility for Hover-Revealed UI Elements
**Learning:** Hidden interactive elements revealed only via `group-hover:opacity-100` create silent traps for keyboard users navigating via Tab, rendering action buttons effectively invisible despite being focusable.
**Action:** When implementing Tailwind's `group-hover` revelation patterns (like opacity or translation), systematically pair them with focus-aware states like `group-focus-within` or `focus-visible` to ensure full accessibility for non-mouse inputs.
