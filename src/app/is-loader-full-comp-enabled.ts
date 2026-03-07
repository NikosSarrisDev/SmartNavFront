import { Injectable, signal, WritableSignal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class IsLoaderFullCompEnabled {

  isLoading: WritableSignal<boolean> = signal(false);

  setLoadingToFalse(){
    this.isLoading.set(false);
  }

  setLoadingToTrue(){
    this.isLoading.set(true);
  }
  
}
