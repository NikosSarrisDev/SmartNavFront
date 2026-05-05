import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, CanActivateFn } from '@angular/router';
import { AuthenticationService } from "./auth.service";
import { DataService } from "./data.service";
import { firstValueFrom, timeout } from 'rxjs';

export const authGuard: CanActivateFn = async (
    route: ActivatedRouteSnapshot, 
    state: RouterStateSnapshot
) => {
    const authenticationService = inject(AuthenticationService);
    const router = inject(Router);
    const dataService = inject(DataService);

    const currentUser = authenticationService.currentUser();

    if (currentUser) {
        try {
            const userId = currentUser?.data?.id;
            if (!userId) {
                authenticationService.logout();
                return router.createUrlTree(['login']);
            }

            const userResponse = await firstValueFrom(
                dataService.getUser(userId).pipe(timeout(8000))
            );
            if (userResponse?.status === 'success') {
                return true;
            }
        } catch {
            // Invalid/stale session.
        }
    }

    authenticationService.logout();
    return router.createUrlTree(['login']);
};
