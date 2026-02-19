
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="login-container">
      <div class="login-card">
        <h2>🔐 Acesso Restrito</h2>
        <p class="subtitle">Medical Scribe Enterprise</p>

        <div class="form-group">
          <label for="email">E-mail</label>
          <input type="email" id="email" [(ngModel)]="email" placeholder="admin@hospital.com" />
        </div>

        <div class="form-group">
          <label for="password">Senha</label>
          <input type="password" id="password" [(ngModel)]="password" placeholder="••••••••" />
        </div>

        <button class="btn-login" (click)="login()" [disabled]="loading">
          {{ loading ? 'Entrando...' : 'Acessar Sistema' }}
        </button>

        <p class="error-msg" *ngIf="error">{{ error }}</p>
      </div>
    </div>
  `,
    styles: [`
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: #0F172A;
      color: #E2E8F0;
    }
    .login-card {
      background: #1E293B;
      padding: 40px;
      border-radius: 16px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.05);
      text-align: center;
    }
    h2 { margin: 0 0 8px; font-size: 1.5rem; color: #fff; }
    .subtitle { margin: 0 0 32px; color: #94A3B8; font-size: 0.9rem; }

    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      color: #CBD5E1;
    }
    input {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #334155;
      background: #0F172A;
      color: #fff;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #3B82F6; }

    .btn-login {
      width: 100%;
      padding: 12px;
      background: #3B82F6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 10px;
    }
    .btn-login:hover { background: #2563EB; }
    .btn-login:disabled { opacity: 0.7; cursor: not-allowed; }

    .error-msg {
      margin-top: 20px;
      color: #EF4444;
      font-size: 0.9rem;
      background: rgba(239,68,68,0.1);
      padding: 10px;
      border-radius: 6px;
    }
  `]
})
export class LoginComponent {
    email = '';
    password = '';
    loading = false;
    error = '';

    private http = inject(HttpClient);
    private router = inject(Router);

    login() {
        if (!this.email || !this.password) {
            this.error = 'Preencha todos os campos.';
            return;
        }

        this.loading = true;
        this.error = '';

        // OAuth2 password flow expects form-urlencoded data
        const body = new URLSearchParams();
        body.set('username', this.email);
        body.set('password', this.password);

        this.http.post<any>('/api/v1/auth/token', body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }).subscribe({
            next: (res) => {
                this.loading = false;
                if (res.access_token) {
                    localStorage.setItem('token', res.access_token);
                    // Redirect to dashboard or home
                    this.router.navigate(['/app']);
                }
            },
            error: (err: HttpErrorResponse) => {
                this.loading = false;
                console.error(err);
                this.error = err.error?.detail || 'Falha na autenticação. Verifique suas credenciais.';
            }
        });
    }
}
