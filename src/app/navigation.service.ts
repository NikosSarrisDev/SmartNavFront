import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MapDirectionsService } from '@angular/google-maps';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';

export type VehicleSize = 'small' | 'medium' | 'large' | 'truck';

export interface JourneyFilterStation {
  street: string;
  number: string;
  cityArea: string;
  postalCode: string;
}

export interface HomeDraftState {
  searchText: string;
  selectedChip: string;
  selectedChipPrompt: string;
}

const createDefaultJourneyFilters = (): JourneyFilterStation[] => [];
const createDefaultHomeDraft = (): HomeDraftState => ({
  searchText: '',
  selectedChip: '',
  selectedChipPrompt: '',
});

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly GEMINI_KEY = environment.geminiApiKey;
  private readonly GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${this.GEMINI_KEY}`;
  private readonly journeyFiltersState = signal<JourneyFilterStation[]>(
    createDefaultJourneyFilters(),
  );
  private readonly vehicleSizeState = signal<VehicleSize | null>(null);
  private readonly homeDraftState = signal<HomeDraftState>(createDefaultHomeDraft());

  public isLoading$ = new BehaviorSubject<boolean>(false);
  public errorMessage$ = new BehaviorSubject<string | null>(null);
  public readonly journeyFilters = this.journeyFiltersState.asReadonly();
  public readonly vehicleSize = this.vehicleSizeState.asReadonly();
  public readonly homeDraft = this.homeDraftState.asReadonly();

  constructor(
    private http: HttpClient,
    private directionsService: MapDirectionsService,
  ) {}

  setJourneyFilters(filters: JourneyFilterStation[]): void {
    const normalized = filters
      .map((filter) => ({
        street: filter.street.trim(),
        number: filter.number.trim(),
        cityArea: filter.cityArea.trim(),
        postalCode: filter.postalCode.trim(),
      }))
      .filter((filter) => this.hasAnyAddressField(filter));

    this.journeyFiltersState.set(normalized);
  }

  setVehicleSize(size: VehicleSize | null): void {
    this.vehicleSizeState.set(size);
  }

  setHomeDraft(draft: Partial<HomeDraftState>): void {
    const current = this.homeDraftState();
    this.homeDraftState.set({
      searchText: draft.searchText ?? current.searchText,
      selectedChip: draft.selectedChip ?? current.selectedChip,
      selectedChipPrompt: draft.selectedChipPrompt ?? current.selectedChipPrompt,
    });
  }

  getHomeDraftSnapshot(): HomeDraftState {
    return { ...this.homeDraftState() };
  }

  getSmartRoute(userNeed: string, currentPos: google.maps.LatLngLiteral): Observable<any> {
    this.isLoading$.next(true);
    this.errorMessage$.next(null);

    const savedStations = this.journeyFiltersState();
    const savedVehicleSize = this.vehicleSizeState();
    const formattedStations = savedStations
      .map((station) => this.formatStation(station))
      .filter((station) => station.length > 0);
    const filterPrompt = this.buildFilterPrompt(savedStations, savedVehicleSize);

    const prompt = {
      contents: [
        {
          parts: [
            {
              text: `Current location: lat ${currentPos.lat}, lng ${currentPos.lng}.
User need: "${userNeed}".
${filterPrompt}
Rules:
1. If not travel/places/navigation, return {"error":"not_navigation"}.
2. Otherwise, return ONLY:
{ "origin":"address or empty string", "dest":"address", "info":"Greek text" }
3. If user need does not contain a clear departure point, set "origin" to an empty string.`,
            },
          ],
        },
      ],
    };

    return this.http.post(this.GEMINI_URL, prompt).pipe(
      map((response: any) => {
        try {
          if (!response.candidates || response.candidates.length === 0) {
            throw new Error('AI could not find a route.');
          }

          const text = response.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
          const parsed = JSON.parse(text);

          if (parsed.error === 'not_navigation') {
            throw new Error('This request is not related to navigation.');
          }

          const destination = `${parsed.dest ?? ''}`.trim();
          const origin = `${parsed.origin ?? ''}`.trim();
          const info = `${parsed.info ?? ''}`.trim();

          if (!destination) {
            throw new Error('AI could not find a destination.');
          }

          return {
            dest: destination,
            origin,
            info,
          };
        } catch {
          throw new Error('Failed to parse AI response.');
        }
      }),
      switchMap((aiData: { dest: string; origin: string; info: string }) => {
        const routeOrigin = aiData.origin.length > 0 ? aiData.origin : currentPos;
        const request: google.maps.DirectionsRequest = {
          origin: routeOrigin,
          destination: aiData.dest,
          waypoints: formattedStations.map((stop: string) => ({ location: stop, stopover: true })),
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: true,
        };

        return this.directionsService.route(request).pipe(
          map((res) => {
            if (res.status !== 'OK') {
              throw new Error('Google Maps could not build this route.');
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
        let userMessage = 'Something went wrong.';

        if (error instanceof HttpErrorResponse) {
          if (error.status === 403 || error.status === 401) {
            userMessage = 'Gemini API key issue.';
          } else if (error.status === 429) {
            userMessage = 'Too many requests. Please retry.';
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

  getVehicleSizeSnapshot(): VehicleSize | null {
    return this.vehicleSizeState();
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

  private buildFilterPrompt(
    filters: JourneyFilterStation[],
    vehicleSize: VehicleSize | null,
  ): string {
    const stationDetails = filters
      .map((filter, index) => ({
        stationNumber: index + 1,
        address: this.formatStation(filter),
      }))
      .filter((filter) => filter.address.length > 0)
      .map((filter) => `station ${filter.stationNumber}: "${filter.address}"`);
    const details: string[] = [];

    if (stationDetails.length) {
      details.push(`Stops: ${stationDetails.join('. ')}`);
    }

    if (vehicleSize) {
      details.push(`Vehicle: "${vehicleSize}". Avoid roads that do not fit.`);
    }

    if (!details.length) {
      return 'Filters: none.';
    }

    return `Filters: ${details.join(' ')}`;
  }

  private formatStation(station: JourneyFilterStation): string {
    return [station.street, station.number, station.cityArea, station.postalCode]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .join(', ');
  }

  private hasAnyAddressField(station: JourneyFilterStation): boolean {
    return (
      station.street.length > 0 ||
      station.number.length > 0 ||
      station.cityArea.length > 0 ||
      station.postalCode.length > 0
    );
  }
}
