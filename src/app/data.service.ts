import {Injectable} from "@angular/core";
import { RemoteDataService } from "./remotedata.service";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import {catchError, map} from "rxjs/operators";
import {Subject, throwError} from "rxjs";
import {AuthenticationService} from "./auth.service";
import { authGuard } from "./auth-guard";

const httpOptions = {
  headers: new HttpHeaders({'Content-Type': 'application/json'}),
  withCredentials: true
};

@Injectable({
  providedIn: "root"
})
export class DataService {
  constructor(public authenticationService: AuthenticationService,
              private http: HttpClient,
              public remoteDataService: RemoteDataService) {
  }

  recoverPassword(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'forgotPasswordSendEmail', data, httpOptions).pipe(
      map(
        (response: any) => {
          return response;
        }
      ),
      catchError((error: any) => {
        this.handleError(error);
        return throwError(error); // Rethrow the error to be handled by the caller
      }));

  }

  createUser(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'createUser', data, httpOptions).pipe(
      map(
        (response: any) => {
          return response;
        }
      ),
      catchError((error: any) => {
        this.handleError(error);
        return throwError(error); // Rethrow the error to be handled by the caller
      }));

  }

  getUser(data: any){
    return this.http.post<any>(this.remoteDataService.serviceURL + 'getUser', data, httpOptions).pipe(
      map(
        (response: any) => {
          return response;
        }
      ),
      catchError((error: any) => {
        this.handleError(error);
        return throwError(error); // Rethrow the error to be handled by the caller
      }));

  }

  updateUserDetails(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'updateUserDetails', data, httpOptions).pipe(
      map(
        (response: any) => {
          return response;
        }
      ),
      catchError((error: any) => {
        this.handleError(error);
        return throwError(error); // Rethrow the error to be handled by the caller
      }));

  }

  private handleError(error:any) {
    var status = error.error.status;
    if (status == undefined) {
      let errorJson = JSON.parse(error.error);
      status = errorJson.status;
    }
    if (status == '403') {
      this.authenticationService.logout();
      window.location.reload();
    } else if (status == '405') {
      alert('Δεν έχετε τα απαραίτητα δικαιώματα γιαυτήν την ενέργεια');
      //this.toastr.error('Δεν έχετε τα απαραίτητα δικαιώματα γιαυτήν την ενέργεια', 'warning');
    }
  }

}