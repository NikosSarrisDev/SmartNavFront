import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthenticationService } from './auth.service';
import { DataService } from './data.service';
import { firstValueFrom } from 'rxjs';

export const adminGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const authenticationService = inject(AuthenticationService);
  const dataService = inject(DataService);
  const router = inject(Router);

  const currentUser = authenticationService.currentUser();
  const userId = currentUser?.data?.id;

  if (!userId) {
    authenticationService.logout();
    return router.createUrlTree(['login']);
  }

  try {
    const response = await firstValueFrom(dataService.getCurrentUserRoleAndAvatar({ userId }));
    const roleName = (response?.data?.roleName ?? '').toString().toLowerCase();
    const isAdmin = roleName.includes('admin') || roleName.includes('διαχ');
    return isAdmin ? true : router.createUrlTree(['home']);
  } catch {
    return router.createUrlTree(['home']);
  }
};
