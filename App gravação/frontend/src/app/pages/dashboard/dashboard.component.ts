
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="dashboard-container">
      <h2>📊 Painel Administrativo</h2>
      
      <div class="stats-grid" *ngIf="stats">
        <div class="stat-card">
          <h3>Total Atendimentos</h3>
          <p class="stat-value">{{ stats.summary.total_consultations }}</p>
        </div>
        <div class="stat-card">
          <h3>Tempo Médio</h3>
          <p class="stat-value">{{ stats.summary.avg_duration_min }} min</p>
        </div>
      </div>

      <div class="charts-row" *ngIf="stats">
        <div class="chart-card">
            <h3>Top 5 Patologias (CID)</h3>
            <canvas baseChart
              [data]="cidChartData"
              [options]="barChartOptions"
              [type]="'bar'">
            </canvas>
        </div>
        <div class="chart-card">
            <h3>Faixa Etária</h3>
            <canvas baseChart
              [data]="ageChartData"
              [options]="pieChartOptions"
              [type]="'pie'">
            </canvas>
        </div>
      </div>

      <div class="medications-list" *ngIf="stats">
        <h3>💊 Top Medicações Prescritas</h3>
        <ul>
            <li *ngFor="let med of stats.top_medications">
                <span class="med-name">{{ med.name }}</span>
                <span class="med-count">{{ med.count }}x</span>
            </li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container { padding: 24px; color: #E2E8F0; }
    h2 { margin-bottom: 24px; font-size: 1.5rem; }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: #1E293B;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .stat-value { font-size: 2rem; font-weight: bold; color: #3B82F6; margin: 10px 0 0; }

    .charts-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
      margin-bottom: 24px;
    }
    .chart-card {
      background: #1E293B;
      padding: 20px;
      border-radius: 12px;
    }

    .medications-list {
      background: #1E293B;
      padding: 20px;
      border-radius: 12px;
    }
    ul { list-style: none; padding: 0; }
    li {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .med-count { font-weight: bold; color: #10B981; }
  `]
})
export class DashboardComponent implements OnInit {
  private adminService = inject(AdminService);
  stats: any = null;

  cidChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  ageChartData: ChartConfiguration<'pie'>['data'] = { labels: [], datasets: [] };

  barChartOptions: ChartOptions<'bar'> = { responsive: true, color: '#fff' };
  pieChartOptions: ChartOptions<'pie'> = { responsive: true };

  ngOnInit() {
    this.adminService.getDashboardStats()
      .subscribe(data => {
        this.stats = data;
        this.setupCharts();
      });
  }

  setupCharts() {
    if (!this.stats) return;

    // CID Chart
    this.cidChartData = {
      labels: this.stats.pathologies.slice(0, 5).map((p: any) => p.code),
      datasets: [{
        data: this.stats.pathologies.slice(0, 5).map((p: any) => p.count),
        label: 'Ocorrências',
        backgroundColor: '#3B82F6'
      }]
    };

    // Age Chart
    this.ageChartData = {
      labels: Object.keys(this.stats.demographics.age_groups),
      datasets: [{
        data: Object.values(this.stats.demographics.age_groups),
        backgroundColor: ['#10B981', '#F59E0B', '#3B82F6', '#EF4444']
      }]
    };
  }
}
