
## 2024-05-18 - Custom Rating Component Accessibility
**Learning:** Custom UI components like a 5-star rating system (using buttons for each star) require grouping roles (`role="radiogroup"`) and individual item roles (`role="radio"`) to be correctly announced to screen readers. They also need explicit visual focus indicators (`focus-visible` classes) because the default `focus:outline-none` used for styling hides keyboard focus, making navigation impossible for keyboard-only users.
**Action:** When building custom rating or selection components, always provide an encompassing container role, explicit selection state (`aria-checked`), descriptive labels (`aria-label` stating the value), and ensure `focus-visible` rings are added if default outlines are removed.
