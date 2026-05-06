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
  vehicleChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
      },
    },
  };
  stationChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
      },
    },
  };
  analyticsUsers = signal<Array<{ userId: number; userName: string }>>([]);
  analyticsByUser = signal<any[]>([]);
  currentAnalyticsUserIndex = signal(0);
  currentAnalyticsUserId = signal(0);
  selectedTripId = signal(0);
  tripsForSelectedUser = signal<any[]>([]);
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

    this.loadAnalyticsByUser();
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

  backToUser(): void {
    this.router.navigate(['/user']);
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

  getCurrentAnalyticsUserName(): string {
    const currentId = this.currentAnalyticsUserId();
    const user = this.analyticsUsers().find((u) => u.userId === currentId);
    return user?.userName ?? '-';
  }

  previousAnalyticsUser(): void {
    const snapshots = this.analyticsByUser();
    if (snapshots.length <= 1) {
      return;
    }

    const currentIndex = this.currentAnalyticsUserIndex();
    const nextIndex = currentIndex <= 0 ? snapshots.length - 1 : currentIndex - 1;
    this.currentAnalyticsUserIndex.set(nextIndex);
    this.bindCurrentAnalyticsSnapshot();
  }

  nextAnalyticsUser(): void {
    const snapshots = this.analyticsByUser();
    if (snapshots.length <= 1) {
      return;
    }

    const currentIndex = this.currentAnalyticsUserIndex();
    const nextIndex = currentIndex >= snapshots.length - 1 ? 0 : currentIndex + 1;
    this.currentAnalyticsUserIndex.set(nextIndex);
    this.bindCurrentAnalyticsSnapshot();
  }

  onTripSelectionChange(tripIdText: number | string): void {
    const tripId = Number(tripIdText);
    if (!tripId || tripId === this.selectedTripId()) {
      return;
    }

    this.selectedTripId.set(tripId);
    this.bindStationChart(this.tripsForSelectedUser(), tripId);

    const currentIndex = this.currentAnalyticsUserIndex();
    const snapshots = [...this.analyticsByUser()];
    if (!snapshots[currentIndex]) {
      return;
    }

    snapshots[currentIndex] = {
      ...snapshots[currentIndex],
      selectedTripId: tripId,
    };
    this.analyticsByUser.set(snapshots);
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
      labels: vehicleUsage.map((x) => this.resolveVehicleLabel(x)),
      datasets: [
        {
          label: this.translate.instant('ADMIN_CHART_VEHICLE_DATASET'),
          data: vehicleUsage.map((x) => x.tripCount),
          backgroundColor: ['#38bdf8', '#4ade80', '#f59e0b', '#a78bfa', '#fb7185', '#34d399'],
          borderRadius: 8,
          barThickness: 16,
          maxBarThickness: 18,
        },
      ],
    });
  }

  private resolveVehicleLabel(vehicle: any): string {
    if (vehicle?.vehicleId == null) {
      return this.translate.instant('ADMIN_VEHICLE_ANY');
    }

    const translationField = `${vehicle?.vehicleTranslationField ?? ''}`.trim();
    if (translationField) {
      const translated = this.translate.instant(translationField);
      if (translated && translated !== translationField) {
        return translated;
      }
    }

    return `${vehicle?.vehicleLabel ?? ''}`.trim() || 'Vehicle';
  }

  private bindStationChart(trips: any[], selectedTripId: number): void {
    const labels = trips.map((x) => x.displayLabel);
    const data = trips.map((x) => x.stationCount);
    const pointRadius = trips.map((x) => (x.tripId === selectedTripId ? 6 : 3));
    const pointBackgroundColor = trips.map((x) => (x.tripId === selectedTripId ? '#0369a1' : '#0ea5e9'));

    this.stationChartData.set({
      labels,
      datasets: [
        {
          label: this.translate.instant('ADMIN_CHART_STATION_DATASET'),
          data,
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.25)',
          fill: true,
          tension: 0.25,
          pointRadius,
          pointBackgroundColor,
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

  private bindCurrentAnalyticsSnapshot(): void {
    const snapshots = this.analyticsByUser();
    const currentIndex = this.currentAnalyticsUserIndex();
    const snapshot = snapshots[currentIndex];

    if (!snapshot) {
      this.currentAnalyticsUserId.set(0);
      this.tripsForSelectedUser.set([]);
      this.selectedTripId.set(0);
      this.vehicleChartData.set(null);
      this.stationChartData.set(null);
      return;
    }

    const userId = Number(snapshot.userId ?? 0);
    this.currentAnalyticsUserId.set(userId);

    const trips = snapshot.trips ?? [];
    this.tripsForSelectedUser.set(trips);

    let selectedTripId = Number(snapshot.selectedTripId ?? 0);
    if (!trips.some((t: any) => Number(t.tripId) === selectedTripId)) {
      selectedTripId = Number(trips[0]?.tripId ?? 0);
    }
    this.selectedTripId.set(selectedTripId);

    this.bindVehicleChart(snapshot.vehicleUsage ?? []);
    this.bindStationChart(trips, selectedTripId);
  }

  private loadAnalyticsByUser(): void {
    this.loading.set(true);
    this.dataService
      .adminAnalyticsByUser({
        adminUserId: this.adminUserId,
        targetUserId: 0,
        tripId: null,
      })
      .subscribe({
        next: (response: any) => {
          const data = response?.data ?? {};
          const users = (data.users ?? []).map((x: any) => ({
            userId: Number(x.userId ?? 0),
            userName: `${x.userName ?? ''}`,
          }));
          const analyticsByUser = data.analyticsByUser ?? [];
          const currentUserId = Number(data.currentUserId ?? 0);
          let currentIndex = analyticsByUser.findIndex((x: any) => Number(x.userId) === currentUserId);
          if (currentIndex < 0) {
            currentIndex = 0;
          }

          this.analyticsUsers.set(users);
          this.analyticsByUser.set(analyticsByUser);
          this.currentAnalyticsUserIndex.set(currentIndex);
          this.bindCurrentAnalyticsSnapshot();
        },
        error: () => {
          this.analyticsUsers.set([]);
          this.analyticsByUser.set([]);
          this.currentAnalyticsUserIndex.set(0);
          this.currentAnalyticsUserId.set(0);
          this.tripsForSelectedUser.set([]);
          this.selectedTripId.set(0);
          this.vehicleChartData.set(null);
          this.stationChartData.set(null);
        },
        complete: () => {
          this.loading.set(false);
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
