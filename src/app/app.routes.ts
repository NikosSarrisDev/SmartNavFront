import {Routes} from '@angular/router';
import {Login} from './Main-app/login/login';
import { Register } from './Main-app/register/register';
import { authGuard } from './auth-guard';
import { PasswordRecovery } from './Main-app/password-recovery/password-recovery';
import { Full } from './Main-app/full/full';
import { Home } from './Main-app/home/home';
import { User } from './Main-app/full/user/user';

export const routes: Routes = [
  {
    path: '',
    component: Full,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: '',
        component: Home,
        pathMatch: 'full',
      }
    ]
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
    path: 'user',
    component: User
  },
  {
    path: '**',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];