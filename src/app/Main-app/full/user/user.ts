import { Component, OnInit, signal, WritableSignal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DataService } from '../../../data.service';
import { AuthenticationService } from '../../../auth.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Menu, MenuModule } from "primeng/menu";
import {MenuItem, MessageService} from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators, ɵInternalFormsSharedModule, ReactiveFormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import {FloatLabel} from 'primeng/floatlabel';
import {InputText} from 'primeng/inputtext';
import { AvatarModule } from 'primeng/avatar';

@Component({
  selector: 'app-user',
  imports: [ProgressSpinnerModule, TranslatePipe, DatePipe, MenuModule, ButtonModule, DialogModule, FloatLabel, InputText, ɵInternalFormsSharedModule, ReactiveFormsModule, CommonModule, AvatarModule],
  templateUrl: './user.html',
  styleUrl: './user.css',
  providers: [MessageService]
})
export class User implements OnInit {
  public userUpdateForm!: FormGroup;
  submitted: boolean = false;
  loading: boolean = false;
  visibleDialog: boolean = false;
  currentUserId!: any
  currentRole!: string
  currentAvatar!: string
  currentEmail!: string
  currentUserName = signal<string>('');
  trips: any[] = []
  totalTrips!: number
  totalDistance!: number
  loadingRoleAvatar = signal(false);
  loadingTrips = signal(false);
  isEditMode = signal(false);
  languages: MenuItem[] | undefined;
  dialogAvatars: any[] = [];
  preferences = signal<any[]>([]);
  activePreference: any[] = [];


  constructor(private formBuilder: FormBuilder, private dataService: DataService, private auth: AuthenticationService, private translate: TranslateService, private router: Router, private messageService: MessageService){}

  ngOnInit(): void {
    this.userUpdateForm = this.formBuilder.group({
      avatar: [this.currentAvatar],
      username: [this.currentUserName()],
    })

    this.translate.use('el');
    this.languages = [
            {
                label: 'Γλώσσα - Language',
                items: [
                    {
                        label: 'Ελληνικά (ΕΛ)',
                        icon: '',
                        command: () => {
                          this.changeLanguage('el');
                        }
                    },
                    {
                        label: 'English (EN)',
                        icon: '',
                        command: () => {
                          this.changeLanguage('en');
                        }
                    }
                ]
            }
        ];

    setTimeout(() => {
        if(!!this.auth.user && !!this.auth.user.data){
        this.loadingRoleAvatar.set(true);
        this.loadingTrips.set(true);
        this.currentUserId = this.auth.user.data.id
        this.currentEmail = this.auth.user.data.email
        this.getUser(this.currentUserId);

        this.getCurrentUserRoleAndAvatar(this.currentUserId);
        this.getAvatars();
        this.getPreferences();
        this.getActivePreference(this.currentUserId);
        this.getTrips(this.currentUserId);
      }
      else{
        this.loadingRoleAvatar.set(false);
        this.loadingTrips.set(false);
      }
    }, 0)
  }

  validateAllFromFields(formGroup: FormGroup| any){
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);
      if (control instanceof FormControl) {
        control.markAsDirty({onlySelf: true});
      }else if (control instanceof FormGroup){
        this.validateAllFromFields(control);
      }
    })
  }

  getUser(currentUserId: number){
    this.dataService.getUser(currentUserId).subscribe((response: any) => {
      this.currentUserName.set(response.data.userName);
      this.userUpdateForm.patchValue({ username: this.currentUserName() })
    })
  }

  getCurrentUserRoleAndAvatar(userId: number) {
    this.dataService.getCurrentUserRoleAndAvatar({ userId })
      .pipe(finalize(() => this.loadingRoleAvatar.set(false)))
      .subscribe({
        next: (response: any) => {
          this.loadingRoleAvatar.set(false);
          this.currentRole = response.data.roleName;
          this.currentAvatar = response.data.avatarURL;
        },
        error: (err) => console.error("Avatar Load Failed", err)
      });
  }

  getAvatars(){
    this.dataService.getAvatars({}).subscribe((response) => {
      this.dialogAvatars = response.data
    })
  }

  getTrips(userId: number) {
  this.dataService.getUserTripDetails({ userId })
    .pipe(finalize(() => this.loadingTrips.set(false)))
    .subscribe({
      next: (response: any) => {
        this.loadingTrips.set(false);
        this.trips = response.data;
        this.totalTrips = response.statistics.totalTrips;
        this.totalDistance = response.statistics.totalDistance;
      },
      error: (err) => console.error("Trips Load Failed", err)
    });
  }

  getPreferences(){
    this.dataService.getPreferences({}).subscribe((response) => {
      this.preferences = signal(response.data)
    })
  }

  getActivePreference(userId: number){
    this.dataService.getCurrentUserActivePreference({ userId }).subscribe((response) => {
      this.activePreference = response.data;
      this.togglePreference(this.activePreference[0]?.activePreference)
    })
  }

  togglePreference(id: string) {
    this.preferences.update(prefs => 
      prefs.map(p => ({
        ...p,
        active: p.id === id ? true : false
      }))
    );
    this.dataService.updateUserDetails({ id: this.currentUserId, preferenceId: id }).subscribe((r: any) => {
        this.messageService.add({severity: 'success', summary: 'Success!', detail: r.message});
    })
  }

  saveChanges(){
    if (this.userUpdateForm.invalid){
      this.messageService.add({severity: 'success', summary: 'Success!', detail: 'Η φόρμα σας δεν είναι έγκυρη, παρακαλώ όλα τα υποχρεωτικά όλα τα υποχρεωτικά πεδία'})
      this.validateAllFromFields(this.userUpdateForm);
      this.submitted = true;
      return;
    }
    this.loadingRoleAvatar.set(true);

    const selectedUserName = this.userUpdateForm.get('username')?.value;
    const selectedAvatarId = this.userUpdateForm.get('avatar')?.value;

    this.dataService.updateUserDetails({ id: this.currentUserId, userName: selectedUserName, avatarId: selectedAvatarId }).subscribe((r: any) =>{
      this.isEditMode.set(false);
      if(r.status == 'success'){
        //Update the template immidiatelly after success : selected User Name
        this.currentUserName.set(selectedUserName);
        this.messageService.add({severity: 'success', summary: 'Success!', detail: r.message});
        this.getCurrentUserRoleAndAvatar(this.currentUserId);
        this.getUser(this.currentUserId);
      }else {
        this.messageService.add({severity: 'error', summary: 'Error!', detail: r.message});
        this.loadingRoleAvatar.set(false);
      }
    }, (error: any) => {
      this.messageService.add({severity: 'error', summary: 'Error!', detail: 'Κάτι πήγε λάθος, παρακαλώ προσπαθήστε ξανά αργότερα'});
      this.loadingRoleAvatar.set(false);
    })
  }

  changeLanguage(lang: string) {
    this.translate.use(lang);
  }

  showDialog() {
    if(this.isEditMode() && this.dialogAvatars.length > 0){
      this.visibleDialog = true;
    }
  }

  backToHome() {
    this.router.navigate(['/home']);
  }

  switchMode(){
    this.isEditMode.update(prev => !prev);
  }

  selectNewAvatar(avatarId: number, avatarUrl: string) {
    this.visibleDialog = false;
    this.currentAvatar = avatarUrl;
    this.userUpdateForm.patchValue({ avatar: avatarId });
  }

  logout(){
    this.auth.logout();
    window.location.reload();
  }
}
