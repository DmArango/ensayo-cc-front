import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { Sesion } from './nucleo/sesion';
import { TituloPagina } from './nucleo/titulo';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // antes de pintar nada: quién es el usuario y qué perfiles tiene
    provideAppInitializer(() => inject(Sesion).cargar()),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useExisting: TituloPagina },
  ],
};
