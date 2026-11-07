import { AfterViewInit, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Gives the host an id and, when the URL fragment names it (e.g. Readiness → "Fix brand" links to
 * /optimize/amazon#field-brand), scrolls it into view and focuses its first input. The app scrolls
 * inside its own containers, so the router's anchor scrolling can't do this.
 */
@Directive({
  selector: '[appFragmentFocus]',
  standalone: true,
  host: { '[attr.id]': 'appFragmentFocus()' },
})
export class FragmentFocus implements AfterViewInit {
  readonly appFragmentFocus = input.required<string>();
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    if (typeof window === 'undefined' || window.location.hash !== `#${this.appFragmentFocus()}`) return;
    setTimeout(() => {
      const host = this.el.nativeElement;
      host.scrollIntoView({ block: 'center' });
      host.querySelector<HTMLElement>('input, textarea, select')?.focus();
    });
  }
}
