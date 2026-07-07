## 2024-05-16 - Accessible Hover Interactions
**Learning:** When using Tailwind hover-revealed elements (e.g. `opacity-0 group-hover:opacity-100`), keyboard-only users cannot access or see those actions unless focus-within classes are also applied.
**Action:** Always add `group-focus-within:opacity-100` and translation equivalents (like `group-focus-within:translate-x-0`) alongside hover reveal classes to ensure actions remain accessible during keyboard navigation.
