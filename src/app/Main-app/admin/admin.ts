import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../data.service';
import { AuthenticationService } from '../../auth.service';
import { ChartModule } from 'primeng/chart';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-admin',
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    ChartModule,
    MenuModule,
    ButtonModule,
    ProgressSpinnerModule,
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
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
  pendingUserChanges: Record<
    number,
    { targetUserId: number; newRoleId?: number; isVerified?: boolean }
  > = {};
  confirmVisible = signal(false);
  confirmTitle = '';
  confirmMessage = '';
  languages: MenuItem[] = [];
  private pendingAction: (() => void) | null = null;

  constructor(
    private dataService: DataService,
    private auth: AuthenticationService,
    private router: Router,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.buildLanguageMenu();
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
      error: () => this.roles.set([]),
    });

    this.dataService.adminDashboard({ adminUserId: this.adminUserId }).subscribe({
      next: (response: any) => this.dashboard.set(response?.data ?? null),
      error: () => this.dashboard.set(null),
    });

    this.loadUsers(true);

    this.dataService.adminAuditLogs({ adminUserId: this.adminUserId, take: 100 }).subscribe({
      next: (response: any) => this.auditLogs.set(response?.data ?? []),
      error: () => this.auditLogs.set([]),
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
      },
    });
  }

  onSearch(): void {
    this.loadUsers(true);
  }

  updateRole(user: any, roleIdText: number | string): void {
    const newRoleId = Number(roleIdText);
    const currentRoleId = this.resolveUserRoleId(user);
    if (!newRoleId || newRoleId === currentRoleId) {
      return;
    }

    if (user.id === this.adminUserId) {
      return;
    }
    user.roleId = newRoleId;
    user.roleID = newRoleId;
    const previous = this.pendingUserChanges[user.id] ?? { targetUserId: user.id };
    this.pendingUserChanges[user.id] = { ...previous, newRoleId };
  }

  toggleVerification(user: any): void {
    user.isVerified = !user.isVerified;
    const previous = this.pendingUserChanges[user.id] ?? { targetUserId: user.id };
    this.pendingUserChanges[user.id] = { ...previous, isVerified: !!user.isVerified };
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
        this.dataService
          .adminDeleteUser({
            adminUserId: this.adminUserId,
            targetUserId: user.id,
          })
          .subscribe({
            next: () => this.loadAll(),
          });
      },
    );
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  changeLanguage(lang: string): void {
    this.translate.use(lang).subscribe(() => {
      this.buildLanguageMenu();
      this.loadAll();
    });
  }

  getActionLabel(actionType: string): string {
    if (!actionType) {
      return '';
    }

    const key = `ADMIN_ACTION_${actionType}`;
    const translated = this.translate.instant(key);
    return translated === key ? actionType : translated;
  }

  canChangeRole(user: any): boolean {
    return user?.id !== this.adminUserId;
  }

  resolveRoleOptionId(role: any): number {
    return Number(role?.roleID ?? role?.roleId ?? role?.id ?? 0);
  }

  resolveRoleOptionName(role: any): string {
    return `${role?.roleName ?? role?.name ?? ''}`;
  }

  resolveUserRoleId(user: any): number {
    return Number(user?.roleId ?? user?.roleID ?? 0);
  }

  hasPendingChanges(): boolean {
    return Object.keys(this.pendingUserChanges).length > 0;
  }

  applyChanges(): void {
    const changes = Object.values(this.pendingUserChanges);
    if (changes.length === 0) {
      return;
    }

    this.loading.set(true);
    this.dataService
      .adminApplyUserChanges({
        adminUserId: this.adminUserId,
        changes,
      })
      .subscribe({
        next: () => {
          this.pendingUserChanges = {};
          this.loadAll();
        },
        error: () => {
          this.loadAll();
        },
      });
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
      labels: vehicleUsage.map((x) =>
        x.vehicleId == null ? this.translate.instant('ADMIN_VEHICLE_ANY') : x.vehicleLabel,
      ),
      datasets: [
        {
          label: this.translate.instant('ADMIN_CHART_VEHICLE_DATASET'),
          data: vehicleUsage.map((x) => x.tripCount),
          backgroundColor: ['#38bdf8', '#4ade80', '#f59e0b', '#a78bfa', '#fb7185', '#34d399'],
        },
      ],
    });
  }

  private bindStationChart(stationBuckets: any[]): void {
    this.stationChartData.set({
      labels: stationBuckets.map((x) => `${x.stationCount}`),
      datasets: [
        {
          label: this.translate.instant('ADMIN_CHART_STATION_DATASET'),
          data: stationBuckets.map((x) => x.tripCount),
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.25)',
          fill: true,
          tension: 0.25,
        },
      ],
    });
  }

  private loadUsers(manageLoadingState: boolean): void {
    if (manageLoadingState) {
      this.loading.set(true);
    }

    this.dataService.adminUsers({ adminUserId: this.adminUserId, search: this.search }).subscribe({
      next: (response: any) => {
        const normalizedUsers = (response?.data ?? []).map((user: any) => ({
          ...user,
          roleId: Number(user?.roleId ?? user?.roleID ?? 0),
        }));
        this.users.set(normalizedUsers);
      },
      error: () => this.users.set([]),
      complete: () => {
        if (manageLoadingState) {
          this.loading.set(false);
        }
      },
    });
  }

  private buildLanguageMenu(): void {
    this.translate
      .get(['LANGUAGE_MENU_TITLE', 'LANGUAGE_OPTION_EL', 'LANGUAGE_OPTION_EN'])
      .subscribe((t) => {
        this.languages = [
          {
            label: t['LANGUAGE_MENU_TITLE'],
            items: [
              {
                label: t['LANGUAGE_OPTION_EL'],
                icon: '',
                command: () => this.changeLanguage('el'),
              },
              {
                label: t['LANGUAGE_OPTION_EN'],
                icon: '',
                command: () => this.changeLanguage('en'),
              },
            ],
          },
        ];
      });
  }
}
