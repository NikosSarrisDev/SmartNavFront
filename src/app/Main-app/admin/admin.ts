import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../data.service';
import { AuthenticationService } from '../../auth.service';
import { ChartModule } from 'primeng/chart';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, FormsModule, TranslatePipe, ChartModule],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class Admin implements OnInit {
  adminUserId = 0;
  loading = signal(false);
  dashboard = signal<any>(null);
  users = signal<any[]>([]);
  roles = signal<any[]>([]);
  auditLogs = signal<any[]>([]);
  vehicleChartData = signal<any>(null);
  stationChartData = signal<any>(null);
  search = '';
  confirmVisible = signal(false);
  confirmTitle = '';
  confirmMessage = '';
  private pendingAction: (() => void) | null = null;

  constructor(
    private dataService: DataService,
    private auth: AuthenticationService,
    private router: Router,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    const userId = this.auth.currentUser()?.data?.id;
    this.adminUserId = Number(userId ?? 0);

    if (!this.adminUserId) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);

    this.dataService.getRoles({}).subscribe({
      next: (response: any) => this.roles.set(response?.data ?? []),
      error: () => this.roles.set([])
    });

    this.dataService.adminDashboard({ adminUserId: this.adminUserId }).subscribe({
      next: (response: any) => this.dashboard.set(response?.data ?? null),
      error: () => this.dashboard.set(null)
    });

    this.dataService.adminUsers({ adminUserId: this.adminUserId, search: this.search }).subscribe({
      next: (response: any) => this.users.set(response?.data ?? []),
      error: () => this.users.set([]),
      complete: () => this.loading.set(false)
    });

    this.dataService.adminAuditLogs({ adminUserId: this.adminUserId, take: 100 }).subscribe({
      next: (response: any) => this.auditLogs.set(response?.data ?? []),
      error: () => this.auditLogs.set([])
    });

    this.dataService.adminAnalytics({ adminUserId: this.adminUserId }).subscribe({
      next: (response: any) => {
        const data = response?.data ?? {};
        this.bindVehicleChart(data.vehicleUsage ?? []);
        this.bindStationChart(data.stationBuckets ?? []);
      },
      error: () => {
        this.vehicleChartData.set(null);
        this.stationChartData.set(null);
      }
    });
  }

  onSearch(): void {
    this.dataService.adminUsers({ adminUserId: this.adminUserId, search: this.search }).subscribe({
      next: (response: any) => this.users.set(response?.data ?? []),
      error: () => this.users.set([])
    });
  }

  updateRole(user: any, roleIdText: string): void {
    const newRoleId = Number(roleIdText);
    if (!newRoleId || newRoleId === user.roleId) {
      return;
    }

    if (user.id === this.adminUserId) {
      return;
    }
    const role = this.roles().find(r => Number(r.roleID) === newRoleId);
    const roleLabel = role?.roleName ?? `${newRoleId}`;
    this.openConfirm(
      this.translate.instant('ADMIN_CONFIRM_TITLE'),
      this.translate.instant('ADMIN_CHANGE_ROLE_CONFIRM', {
        user: user.userName || user.email || user.id,
        role: roleLabel
      }),
      () => {
        this.dataService.adminUpdateUserRole({
          adminUserId: this.adminUserId,
          targetUserId: user.id,
          newRoleId
        }).subscribe({
          next: () => this.loadAll()
        });
      }
    );
  }

  toggleVerification(user: any): void {
    this.openConfirm(
      this.translate.instant('ADMIN_CONFIRM_TITLE'),
      this.translate.instant('ADMIN_TOGGLE_VERIFY_CONFIRM', {
        user: user.userName || user.email || user.id
      }),
      () => {
        this.dataService.adminUpdateUserVerification({
          adminUserId: this.adminUserId,
          targetUserId: user.id,
          isVerified: !user.isVerified
        }).subscribe({
          next: () => this.loadAll()
        });
      }
    );
  }

  deleteUser(user: any): void {
    const label = user.userName || user.email || `${user.id}`;
    if (user.id === this.adminUserId) {
      return;
    }
    this.openConfirm(
      this.translate.instant('ADMIN_CONFIRM_TITLE'),
      this.translate.instant('ADMIN_DELETE_CONFIRM', { user: label }),
      () => {
        this.dataService.adminDeleteUser({
          adminUserId: this.adminUserId,
          targetUserId: user.id
        }).subscribe({
          next: () => this.loadAll()
        });
      }
    );
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  canChangeRole(user: any): boolean {
    return user?.id !== this.adminUserId;
  }

  confirmYes(): void {
    const action = this.pendingAction;
    this.closeConfirm();
    if (action) {
      action();
    }
  }

  confirmNo(): void {
    this.closeConfirm();
  }

  private openConfirm(title: string, message: string, action: () => void): void {
    this.confirmTitle = title;
    this.confirmMessage = message;
    this.pendingAction = action;
    this.confirmVisible.set(true);
  }

  private closeConfirm(): void {
    this.confirmVisible.set(false);
    this.pendingAction = null;
    this.confirmTitle = '';
    this.confirmMessage = '';
  }

  private bindVehicleChart(vehicleUsage: any[]): void {
    this.vehicleChartData.set({
      labels: vehicleUsage.map(x => x.vehicleLabel),
      datasets: [
        {
          label: this.translate.instant('ADMIN_CHART_VEHICLE_DATASET'),
          data: vehicleUsage.map(x => x.tripCount),
          backgroundColor: ['#38bdf8', '#4ade80', '#f59e0b', '#a78bfa', '#fb7185', '#34d399']
        }
      ]
    });
  }

  private bindStationChart(stationBuckets: any[]): void {
    this.stationChartData.set({
      labels: stationBuckets.map(x => `${x.stationCount}`),
      datasets: [
        {
          label: this.translate.instant('ADMIN_CHART_STATION_DATASET'),
          data: stationBuckets.map(x => x.tripCount),
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.25)',
          fill: true,
          tension: 0.25
        }
      ]
    });
  }
}
