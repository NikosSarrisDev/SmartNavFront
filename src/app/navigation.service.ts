import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MapDirectionsService } from '@angular/google-maps';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';

export type JourneyStationType = 'start' | 'station' | 'finish';

export interface JourneyFilterStation {
  type: JourneyStationType;
  street: string;
  number: string;
  cityArea: string;
  postalCode: string;
}

const createDefaultJourneyFilters = (): JourneyFilterStation[] => [
  { type: 'start', street: '', number: '', cityArea: '', postalCode: '' },
  { type: 'finish', street: '', number: '', cityArea: '', postalCode: '' },
];

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly GEMINI_KEY = environment.geminiApiKey;
  private readonly GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${this.GEMINI_KEY}`;
  private readonly journeyFiltersState = signal<JourneyFilterStation[]>(createDefaultJourneyFilters());

  public isLoading$ = new BehaviorSubject<boolean>(false);
  public errorMessage$ = new BehaviorSubject<string | null>(null);
  public readonly journeyFilters = this.journeyFiltersState.asReadonly();

  constructor(
    private http: HttpClient,
    private directionsService: MapDirectionsService,
  ) {}

  setJourneyFilters(filters: JourneyFilterStation[]): void {
    const normalized = filters.map((filter) => ({
      type: filter.type,
      street: filter.street.trim(),
      number: filter.number.trim(),
      cityArea: filter.cityArea.trim(),
      postalCode: filter.postalCode.trim(),
    }));
    const start = normalized.find((filter) => filter.type === 'start') ?? {
      type: 'start' as const,
      street: '',
      number: '',
      cityArea: '',
      postalCode: '',
    };
    const stations = normalized.filter((filter) => filter.type === 'station');
    const finish = normalized.find((filter) => filter.type === 'finish') ?? {
      type: 'finish' as const,
      street: '',
      number: '',
      cityArea: '',
      postalCode: '',
    };

    this.journeyFiltersState.set([start, ...stations, finish]);
  }

  getSmartRoute(userNeed: string, currentPos: google.maps.LatLngLiteral): Observable<any> {
    this.isLoading$.next(true);
    this.errorMessage$.next(null);

    const savedFilters = this.journeyFiltersState();
    const startFilter = savedFilters.find((filter) => filter.type === 'start');
    const finishFilter = savedFilters.find((filter) => filter.type === 'finish');
    const stationFilters = savedFilters.filter((filter) => filter.type === 'station');
    const formattedStart = startFilter ? this.formatStation(filterToAddressInput(startFilter)) : '';
    const formattedFinish = finishFilter ? this.formatStation(filterToAddressInput(finishFilter)) : '';
    const formattedStations = stationFilters
      .map((station) => this.formatStation(filterToAddressInput(station)))
      .filter((station) => station.length > 0);
    const filterPrompt = this.buildFilterPrompt(savedFilters);

    const prompt = {
      contents: [
        {
          parts: [
            {
              text: `Current location: lat ${currentPos.lat}, lng ${currentPos.lng}.
User need: "${userNeed}".
${filterPrompt}
Strict Rules:
1. If the user need is NOT about travel, places, or navigation, return: {"error": "not_navigation"}.
2. Otherwise, return ONLY a JSON object:
{ "dest": "string address", "stops": ["address1", "address2"], "info": "Greek explanation" }`,
            },
          ],
        },
      ],
    };

    return this.http.post(this.GEMINI_URL, prompt).pipe(
      map((response: any) => {
        try {
          if (!response.candidates || response.candidates.length === 0) {
            throw new Error('The AI could not find a route.');
          }

          const text = response.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
          const parsed = JSON.parse(text);

          if (parsed.error === 'not_navigation') {
            throw new Error('This request is not related to navigation.');
          }

          return parsed;
        } catch {
          throw new Error('Failed to parse the AI route response.');
        }
      }),
      switchMap((aiData) => {
        const request: google.maps.DirectionsRequest = {
          origin: formattedStart || currentPos,
          destination: formattedFinish || aiData.dest,
          waypoints: [...formattedStations, ...(aiData.stops ?? [])]
            .filter((stop: string) => !!stop?.trim())
            .map((stop: string) => ({ location: stop, stopover: true })),
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: true,
        };

        return this.directionsService.route(request).pipe(
          map((res) => {
            if (res.status !== 'OK') {
              throw new Error('Google Maps could not build a route for these locations.');
            }

            return {
              result: res.result,
              explanation: aiData.info,
            };
          }),
        );
      }),
      catchError((error: unknown) => {
        this.isLoading$.next(false);
        let userMessage = 'Something went wrong. Please try again.';

        if (error instanceof HttpErrorResponse) {
          if (error.status === 403 || error.status === 401) {
            userMessage = 'There is a problem with the Gemini API key.';
          } else if (error.status === 429) {
            userMessage = 'Too many requests. Please wait a moment and retry.';
          }
        } else if (error instanceof Error) {
          userMessage = error.message;
        }

        this.errorMessage$.next(userMessage);
        return throwError(() => error);
      }),
      tap(() => {
        this.isLoading$.next(false);
      }),
    );
  }

  getJourneyFiltersSnapshot(): JourneyFilterStation[] {
    return this.journeyFiltersState().map((filter) => ({ ...filter }));
  }

  getCurrentLocation(): Promise<google.maps.LatLngLiteral> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (res) => {
          this.errorMessage$.next(null);
          resolve({ lat: res.coords.latitude, lng: res.coords.longitude });
        },
        (err) => {
          this.errorMessage$.next('Please allow location access to continue.');
          reject(err);
        },
      );
    });
  }

  private buildFilterPrompt(filters: JourneyFilterStation[]): string {
    const filtersWithValues = filters
      .map((filter) => ({
        type: filter.type,
        address: this.formatStation(filterToAddressInput(filter)),
      }))
      .filter((filter) => filter.address.length > 0);

    if (!filtersWithValues.length) {
      return 'Journey filters from the user form: none.';
    }

    const details = filtersWithValues
      .map((filter, index) => {
        if (filter.type === 'station') {
          return `station ${index}: "${filter.address}"`;
        }

        return `${filter.type}: "${filter.address}"`;
      })
      .join('. ');

    return `Journey filters from the user form: ${details}. Respect them when choosing the final route.`;
  }

  private formatStation(station: Omit<JourneyFilterStation, 'type'>): string {
    return [station.street, station.number, station.cityArea, station.postalCode]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .join(', ');
  }
}

function filterToAddressInput(filter: JourneyFilterStation): Omit<JourneyFilterStation, 'type'> {
  return {
    street: filter.street,
    number: filter.number,
    cityArea: filter.cityArea,
    postalCode: filter.postalCode,
  };
}
