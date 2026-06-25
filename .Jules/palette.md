## 2024-06-25 - Accessible Hover-Revealed UI Elements
**Learning:** Tailwind CSS patterns like `opacity-0 group-hover:opacity-100` create invisible elements that remain inaccessible to keyboard-only users who can tab to them but cannot see them.
**Action:** When creating hover-revealed UI patterns, always include an active focus state equivalent (e.g., `focus-visible:opacity-100` or `focus-within:opacity-100`) and ensure necessary `aria-label`s are attached so screen readers and keyboard users get the full context.
