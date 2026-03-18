import {Injectable} from '@angular/core';
@Injectable({
  providedIn: "root"
})
export class RemoteDataService {

  /***local_dev****/
  public serviceURL = 'https://localhost:44396/api/';
  public serviceServe = 'http://localhost:4200/';
  public coockieName = 'SMARTNAV_COOKIE_SESSION_LOCAL';
  public platform = 'SMARTNAV';

}