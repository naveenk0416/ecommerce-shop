import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private zone = inject(NgZone);

  handleError(error: unknown): void {
    this.zone.run(() => {
      console.error('Global Error:', error);
    });
  }
}
