## 2024-05-19 - Initial exploration\n**Learning:** Application uses `btn-icon-premium` and `btn-icon-dark` with `<ion-icon>` extensively, but often omits `aria-label` or `title`.\n**Action:** Add accessibility tags like `aria-label` and `aria-hidden="true"` to these buttons.
## 2024-05-19 - Interactive Elements Formatting
**Learning:** Assigning `role="button"` and `tabindex="0"` to non-button elements (like `div`) without corresponding click/keyboard event handlers creates "dead" interactive elements for screen readers.
**Action:** Only apply `role="button"` and `tabindex="0"` if the element is genuinely interactive and handles keyboard events properly; otherwise, use semantic HTML like `<button>`.
