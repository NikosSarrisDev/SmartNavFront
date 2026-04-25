import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../data.service';
import { AuthenticationService } from '../../auth.service';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, FormsModule, TranslatePipe],
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
  search = '';

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

    this.dataService.adminUpdateUserRole({
      adminUserId: this.adminUserId,
      targetUserId: user.id,
      newRoleId
    }).subscribe({
      next: () => this.loadAll()
    });
  }

  toggleVerification(user: any): void {
    this.dataService.adminUpdateUserVerification({
      adminUserId: this.adminUserId,
      targetUserId: user.id,
      isVerified: !user.isVerified
    }).subscribe({
      next: () => this.loadAll()
    });
  }

  deleteUser(user: any): void {
    const label = user.userName || user.email || `${user.id}`;
    const prompt = this.translate.instant('ADMIN_DELETE_CONFIRM', { user: label });
    const confirmed = window.confirm(prompt);
    if (!confirmed) {
      return;
    }

    this.dataService.adminDeleteUser({
      adminUserId: this.adminUserId,
      targetUserId: user.id
    }).subscribe({
      next: () => this.loadAll()
    });
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }
}
