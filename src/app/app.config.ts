import {
  ApplicationConfig,
  provideZonelessChangeDetection,
  ErrorHandler,
} from '@angular/core';
import {provideRouter} from '@angular/router';
import {provideHttpClient} from '@angular/common/http';
import {provideIonicAngular} from '@ionic/angular/standalone';

import {routes} from './app.routes';
import {GlobalErrorHandler} from './utils/error-boundary';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(),
    provideIonicAngular({}),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
