import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MapDirectionsService } from '@angular/google-maps';
import { Observable, from, BehaviorSubject } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly GEMINI_KEY = 'ΤΟ_API_KEY_ΣΟΥ';
  private readonly GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.GEMINI_KEY}`;

  // BehaviorSubject για να ξέρει όλη η εφαρμογή αν φορτώνουμε δεδομένα
  public isLoading$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient, private directionsService: MapDirectionsService) {}

  /**
   * 1. Παίρνει το κείμενο του χρήστη
   * 2. Ρωτάει το Gemini για προορισμό και στάσεις
   * 3. Επιστρέφει το Google Directions Result
   */
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
        // Μετατροπή της απάντησης AI σε Google Maps Request
        const request: google.maps.DirectionsRequest = {
          origin: currentPos,
          destination: aiData.dest,
          waypoints: aiData.stops.map((s: string) => ({ location: s, stopover: true })),
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: true
        };

        // Επιστρέφουμε το αποτέλεσμα μαζί με το "info" του AI
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

  /**
   * Παίρνει την τοποθεσία του χρήστη ως Promise
   */
  getCurrentLocation(): Promise<google.maps.LatLngLiteral> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        res => resolve({ lat: res.coords.latitude, lng: res.coords.longitude }),
        err => reject(err)
      );
    });
  }
}