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
    return this.http.post<any>(this.remoteDataService.serviceURL + 'user/forgotPasswordSendEmail', data, httpOptions).pipe(
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
    return this.http.post<any>(this.remoteDataService.serviceURL + 'user/CreateUser', data, httpOptions).pipe(
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

  getUser(id: any){
    return this.http.get<any>(this.remoteDataService.serviceURL + 'user/GetUser/' + id, httpOptions).pipe(
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
    return this.http.post<any>(this.remoteDataService.serviceURL + 'user/updateUserDetails', data, httpOptions).pipe(
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

  getAvatars(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'GetlookUps/Avatars', data, httpOptions).pipe(
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

  getRoles(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'GetlookUps/Roles', data, httpOptions).pipe(
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

  getPreferences(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'GetlookUps/Preference', data, httpOptions).pipe(
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

  getVehicles(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'GetlookUps/Vehicle', data, httpOptions).pipe(
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

  getCurrentUserActivePreference(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'GetlookUps/CurrentUserActivePreference', data, httpOptions).pipe(
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

  getCurrentUserRoleAndAvatar(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'GetlookUps/CurrentUserRoleAndAvatar', data, httpOptions).pipe(
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

  getUserTripDetails(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'Trip/GetUserTripDetails', data, httpOptions).pipe(
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

  tripCreate(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'Trip/Create', data, httpOptions).pipe(
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

  getAiSuggestions(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'Trip/GetAISuggestions', data, httpOptions).pipe(
      map(
        (response: any) => {
          return response;
        }
      ),
      catchError((error: any) => {
        this.handleError(error);
        return throwError(error);
      }));
  }

  tripUpdate(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'Trip/Update', data, httpOptions).pipe(
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

  tripDelete(data:any) {
    return this.http.post<any>(this.remoteDataService.serviceURL + 'Trip/Delete', data, httpOptions).pipe(
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
