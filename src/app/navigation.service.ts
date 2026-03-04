import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MapDirectionsService } from '@angular/google-maps';
import { Observable, from, BehaviorSubject } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly GEMINI_KEY = environment.geminiApiKey;
  private readonly GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.GEMINI_KEY}`;

  public isLoading$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient, private directionsService: MapDirectionsService) {}

  getSmartRoute(userNeed: string, currentPos: google.maps.LatLngLiteral): Observable<any> {
    this.isLoading$.next(true);

    const prompt = {
      contents: [{
        parts: [{
          text: `Current location: lat ${currentPos.lat}, lng ${currentPos.lng}. 
                 User need: "${userNeed}". 
                 Return ONLY a JSON object: 
                 { "dest": "string address", "stops": ["address1", "address2"], "info": "Greek explanation" }`
        }]
      }]
    };

    return this.http.post(this.GEMINI_URL, prompt).pipe(
      map((response: any) => {
        const text = response.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
        return JSON.parse(text);
      }),
      switchMap(aiData => {
        const request: google.maps.DirectionsRequest = {
          origin: currentPos,
          destination: aiData.dest,
          waypoints: aiData.stops.map((s: string) => ({ location: s, stopover: true })),
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: true
        };

        return this.directionsService.route(request).pipe(
          map(res => ({
            result: res.result,
            explanation: aiData.info
          }))
        );
      }),
      map(finalData => {
        this.isLoading$.next(false);
        return finalData;
      })
    );
  }

  getCurrentLocation(): Promise<google.maps.LatLngLiteral> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        res => resolve({ lat: res.coords.latitude, lng: res.coords.longitude }),
        err => reject(err)
      );
    });
  }
}