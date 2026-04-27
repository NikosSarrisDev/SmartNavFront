import {Injectable} from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {map} from 'rxjs/operators';
import {CookieService} from "./cookie.service";
import {Router} from "@angular/router";
import { RemoteDataService } from "./remotedata.service"


const httpOptions = {
  headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
  withCredentials: true
};

@Injectable({providedIn: 'root'})
export class AuthenticationService {
  user: any;
  public currentUserSubject: Subject<any> = new Subject<any>();
  private readonly sessionDurationMs = 24 * 60 * 60 * 1000;

  public menuOtionsInds:any={};


  constructor(private http: HttpClient, private cookieService: CookieService, private remoteDataService: RemoteDataService , private router: Router) {}
  public currentUser(): any {
    if (!this.user) {
      const rawSession = this.cookieService.getCookie(this.remoteDataService.platform+'_user');
      if (!rawSession) {
        return null;
      }

      try {
        const parsed = JSON.parse(rawSession);
        if (parsed?.user && parsed?.expiresAt) {
          const expiresAt = new Date(parsed.expiresAt).getTime();
          if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
            this.logout();
            return null;
          }
          this.user = parsed.user;
        } else {
          // Backward-compatible fallback for older cookie format.
          this.user = parsed;
        }
      } catch {
        this.logout();
        return null;
      }
    }
    return this.user;
  }
  login(userName: string, password: string) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'user/login',
        {
          userName: userName,
          password: password,
        } , httpOptions)
        .pipe(map(user => {
          if (user.data && user.data.isVerified) {
            this.user = user;
            this.currentUserSubject.next(this.user);
            this.cookieService.deleteCookie(this.remoteDataService.platform+'_user');
            this.cookieService.setCookie(this.remoteDataService.platform+'_user', JSON.stringify({
              user,
              expiresAt: new Date(Date.now() + this.sessionDurationMs).toISOString()
            }), 1);
          }
          return user;
        }));
  }

  logout() {
    this.cookieService.deleteCookie(this.remoteDataService.platform+'_user');
    this.user = null;
  }
}
