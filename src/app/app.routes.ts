import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { Sesion } from './nucleo/sesion';
import { AnalistaPagina } from './paginas/analista/analista';
import { ConversacionesPagina } from './paginas/conversaciones/conversaciones';
import { IncidenciasPagina } from './paginas/incidencias/incidencias';
import { ReglasPagina } from './paginas/reglas/reglas';
import { HistorialPagina } from './paginas/historial/historial';
import { DatosPagina } from './paginas/datos/datos';
import { ContextoPagina } from './paginas/contexto/contexto';

/** El analista es para quien crea y cambia reglas; el resto empieza en las incidencias. */
const soloGestor = () => inject(Sesion).puede('gestor') || inject(Router).parseUrl('/incidencias');

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: () => (inject(Sesion).puede('gestor') ? 'analista' : 'incidencias') },
  { path: 'analista', component: AnalistaPagina, canActivate: [soloGestor], title: 'Analista' },
  { path: 'conversaciones', component: ConversacionesPagina, canActivate: [soloGestor], title: 'Conversaciones' },
  { path: 'incidencias', component: IncidenciasPagina, title: 'Incidencias' },
  { path: 'reglas', component: ReglasPagina, title: 'Reglas' },
  { path: 'historial', component: HistorialPagina, title: 'Historial' },
  { path: 'datos', component: DatosPagina, title: 'Datos y campos' },
  { path: 'contexto', component: ContextoPagina, title: 'Contexto de negocio' },
  { path: '**', redirectTo: '' },
];
