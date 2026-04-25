import { Routes } from '@angular/router';
import { Login } from './Main-app/login/login';
import { Register } from './Main-app/register/register';
import { authGuard } from './auth-guard';
import { PasswordRecovery } from './Main-app/password-recovery/password-recovery';
import { Full } from './Main-app/full/full';
import { User } from './Main-app/full/user/user';
import { FilterOptions } from './Main-app/filter-options/filter-options';
import { ResetPassword } from './Main-app/reset-password/reset-password';
import { ChangePassword } from './Main-app/change-password/change-password';
import { Admin } from './Main-app/admin/admin';
import { adminGuard } from './admin-guard';

export const routes: Routes = [
  {
    path: '',
    component: Full,
    canActivate: [authGuard],
  },
  {
    path: 'home',
    component: Full,
    canActivate: [authGuard],
  },
  {
    path: 'filters',
    component: FilterOptions,
    canActivate: [authGuard],
  },
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'register',
    component: Register,
  },
  {
    path: 'forgetPass',
    component: PasswordRecovery
  },
  {
    path: 'reset-password',
    component: ResetPassword,
  },
  {
    path: 'change-password',
    component: ChangePassword,
    canActivate: [authGuard]
  },
  {
    path: 'user',
    component: User,
    canActivate: [authGuard]
  },
  {
    path: 'admin',
    component: Admin,
    canActivate: [authGuard, adminGuard]
  },
  {
    path: '**',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
