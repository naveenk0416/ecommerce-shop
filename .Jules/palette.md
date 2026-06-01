## 2024-05-24 - Accessible Hover-Revealed Actions
**Learning:** Tailwind CSS hover-revealed patterns (e.g., `opacity-0 group-hover:opacity-100` or `translate-x-2 group-hover:translate-x-0`) hide interactive elements from keyboard users because they cannot trigger the hover state.
**Action:** Always pair these hover patterns with `focus-visible` (on the button itself, e.g., `focus-visible:opacity-100`) or `focus-within` (on a container wrapping the buttons, e.g., `focus-within:opacity-100`) to ensure they become visible and accessible during keyboard navigation.
