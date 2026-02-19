
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  template: `
    <div class="app-shell">

      <!-- ═══ Header ═══ -->
      <header class="app-header">
        <div class="header-left">
          <a routerLink="/" class="logo-link">
            <span class="logo-icon">🩺</span>
            <h1>Medical Scribe<span class="version-badge">Enterprise v3</span></h1>
          </a>
        </div>
        <div class="header-right">
            <!-- [NEW] Admin Link -->
            <a routerLink="/admin/dashboard" class="btn-icon-text" title="Painel Admin">
                📊 Admin
            </a>

            <span class="lgpd-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            LGPD
            </span>
            <span class="status-dot online"></span>
        </div>
      </header>

      <!-- ═══ Main Content ═══ -->
      <main class="app-main">
        <router-outlet></router-outlet>
      </main>

      <!-- ═══ Footer ═══ -->
      <footer class="app-footer">
        <span>Medical Scribe Enterprise v3.0 — FastAPI + Angular 17</span>
        <span>LGPD Compliance • {{ currentYear }}</span>
      </footer>

    </div>
  `,
  styles: [`
    /* ═══ Shell ═══ */
    .app-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: #0F172A; /* Global API background essentially */
    }

    /* ═══ Header ═══ */
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 32px;
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(12px);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-link {
        display: flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
    }
    .logo-icon { font-size: 1.6rem; }
    .app-header h1 {
      font-size: 1.3rem;
      font-weight: 700;
      color: #E2E8F0;
      margin: 0;
    }
    .version-badge {
      font-size: 0.65rem;
      font-weight: 600;
      background: rgba(37, 99, 235, 0.2);
      color: #60A5FA;
      padding: 2px 8px;
      border-radius: 20px;
      margin-left: 8px;
      vertical-align: middle;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .btn-icon-text {
        color: #94A3B8;
        text-decoration: none;
        font-weight: 600;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        transition: all 0.2s;
    }
    .btn-icon-text:hover {
        background: rgba(255,255,255,0.05);
        color: #E2E8F0;
    }
    .lgpd-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      background: rgba(6, 214, 160, 0.12);
      color: #06D6A0;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #EF4444;
    }
    .status-dot.online { background: #06D6A0; }

    /* ═══ Main ═══ */
    .app-main {
      flex: 1;
      max-width: 1100px;
      width: 100%;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* ═══ Footer ═══ */
    .app-footer {
      display: flex;
      justify-content: space-between;
      padding: 16px 32px;
      color: #64748B;
      font-size: 0.8rem;
      border-top: 1px solid rgba(255,255,255,0.04);
    }
    
    @media (max-width: 768px) {
       .app-main { padding: 16px; }
       .app-header { padding: 12px 16px; }
       .app-footer { flex-direction: column; gap: 4px; text-align: center; }
    }
  `]
})
export class AppComponent {
  currentYear = new Date().getFullYear();
}
