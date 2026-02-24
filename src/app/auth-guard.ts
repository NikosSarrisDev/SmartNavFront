import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, CanActivateFn } from '@angular/router';
import { AuthenticationService } from "./auth.service";
import { DataService } from "./data.service";
import { RemoteDataService } from "./remotedata.service";

export const authGuard: CanActivateFn = async (
    route: ActivatedRouteSnapshot, 
    state: RouterStateSnapshot
) => {
    const authenticationService = inject(AuthenticationService);
    const router = inject(Router);
    const dataService = inject(DataService);
    const remoteDataService = inject(RemoteDataService);

    const currentUser = authenticationService.currentUser();

    if (currentUser) {
        return true;
    } else {
        authenticationService.logout();
        return router.createUrlTree(['login']);
    }
};