import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MapDirectionsService } from '@angular/google-maps';
import { Observable, from, BehaviorSubject, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly GEMINI_KEY = environment.geminiApiKey;
  private readonly GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.GEMINI_KEY}`;

  public isLoading$ = new BehaviorSubject<boolean>(false);
  public errorMessage$ = new BehaviorSubject<string | null>(null);

  constructor(private http: HttpClient, private directionsService: MapDirectionsService) {}

  getSmartRoute(userNeed: string, currentPos: google.maps.LatLngLiteral): Observable<any> {
    this.isLoading$.next(true);
    this.errorMessage$.next(null);

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
        try {
          if (!response.candidates || response.candidates.length === 0) {
            throw new Error("Το AI δεν μπόρεσε να βρει διαδρομή.");
          }
          const text = response.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
          return JSON.parse(text);
        } catch (e) {
          throw new Error("Αποτυχία ανάλυσης δεδομένων AI.");
        }
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
          map(res => {
            if (res.status !== 'OK') {
              throw new Error("Η Google δεν βρήκε διαδρομή για αυτόν τον προορισμό.");
            }
            return {
              result: res.result,
              explanation: aiData.info
            };
          })
        );
      }),

      catchError((error: any) => {
        this.isLoading$.next(false);
        let userMessage = "Κάτι πήγε στραβά. Δοκιμάστε ξανά.";

        if (error instanceof HttpErrorResponse) {
          if (error.status === 403 || error.status === 401) {
             userMessage = "Πρόβλημα με το API Key. Ελέγξτε τις ρυθμίσεις σας.";
          } else if (error.status === 429) {
             userMessage = "Πολλά αιτήματα μαζί! Περιμένετε λίγο.";
          }
        } else if (error instanceof Error) {
          userMessage = error.message;
        }

        this.errorMessage$.next(userMessage);
        return throwError(() => error); 
      }),
      tap(() => {
        this.isLoading$.next(false);
      })
    );
  }

  getCurrentLocation(): Promise<google.maps.LatLngLiteral> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        res => {
          this.errorMessage$.next(null);
          resolve({ lat: res.coords.latitude, lng: res.coords.longitude });
        },
        err => {
          this.errorMessage$.next("Πρέπει να επιτρέψετε την πρόσβαση στην τοποθεσία σας.");
          reject(err);
        }
      );
    });
  }
}