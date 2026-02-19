
import { Routes } from '@angular/router';
import { AtendimentoComponent } from './pages/atendimento/atendimento.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';

import { LoginComponent } from './pages/login/login.component';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'app', component: AtendimentoComponent },
    { path: 'admin/dashboard', component: DashboardComponent },
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: '**', redirectTo: 'login' }
];
