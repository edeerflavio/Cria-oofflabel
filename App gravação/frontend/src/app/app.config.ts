/**
 * app.config.ts — Application Configuration
 * Provides HttpClient (with fetch), Router, and Chart.js registration
 */
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter(routes),
        provideHttpClient(withFetch()),
        provideAnimations(),
        provideCharts(withDefaultRegisterables()),
    ],
};
