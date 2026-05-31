## 2024-05-31 - Keyboard Inaccessible Hover States
**Learning:** Tailwind CSS patterns that use `opacity-0 group-hover:opacity-100` hide critical UI elements from keyboard navigation. Screen reader users might encounter the button, but sighted keyboard users tabbing through the UI won't see the focus state.
**Action:** Always pair `group-hover:opacity-100` with `focus-visible:opacity-100` (for direct focusable elements) or `focus-within:opacity-100` (for containers holding focusable elements) to ensure the UI reveals the element when accessed via keyboard navigation.
