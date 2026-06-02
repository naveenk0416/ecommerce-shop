## 2024-05-30 - Focus Within for Hover Reveals
**Learning:** Tailwind `group-hover` reveals are completely invisible to keyboard navigation users unless paired with `group-focus-within` or similar focus states.
**Action:** Always add `focus-within:opacity-100` or `group-focus-within:opacity-100` to elements that use `opacity-0 hover:opacity-100`.
