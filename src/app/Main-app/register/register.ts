import {Component, OnInit} from '@angular/core';
import {FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {RemoteDataService} from '../../remotedata.service';
import { MenuItem, MessageService } from 'primeng/api';
import { AuthenticationService } from '../../auth.service';
import {DataService} from '../../data.service';
import {Router, RouterLink} from '@angular/router';
import {ButtonDirective} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {FloatLabel} from 'primeng/floatlabel';
import {InputText} from 'primeng/inputtext';
import {NgIf} from '@angular/common';
import {Password} from 'primeng/password';
import {Toast} from 'primeng/toast';
import {Divider} from 'primeng/divider';
import { passwordStrengthValidator } from './customValidatorPassWordStrength';
import { TranslateDirective, TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ButtonDirective,
    Checkbox,
    FloatLabel,
    FormsModule,
    InputText,
    ButtonModule,
    NgIf,
    Password,
    MenuModule,
    ReactiveFormsModule,
    ProgressSpinnerModule,
    RouterLink,
    Toast,
    Divider,
    ButtonDirective,
    TranslatePipe,
    ButtonDirective,
    TranslateDirective
  ],
  templateUrl: './register.html',
  styleUrl: './register.css',
  providers: [MessageService]
})
export class Register implements OnInit{

  creationForm!: FormGroup;
  email: string = '';
  username: string = '';
  surname: string = '';
  name: string = '';
  phone: string = "";
  photo: string = "";
  password: string = '';
  verifyPassword: string = '';
  submitted: boolean = false;
  languages: MenuItem[] | undefined;
  loading: boolean = false;
  selectedRole: any = '';
  roles: any[] = [];
  avatars: any[] = [];
  activeIndex: number = 0;

  constructor(private formBuilder: FormBuilder,
              private remoteDataService: RemoteDataService,
              private messageService: MessageService,
              public dataService: DataService,
              private router: Router,
              private authenticationService: AuthenticationService,
              private translate: TranslateService) {
  }

  ngOnInit() {
    this.getAvatars();
    this.getRoles();
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

    this.creationForm = this.formBuilder.group({
      avatar: [this.selectedAvatar],
      role: [this.selectedRole],
      username: [this.username],
      name: [this.name, [Validators.required, Validators.minLength(4)]],
      surname: [this.surname, [Validators.required, Validators.minLength(4)]],
      email: [this.email, [Validators.required, Validators.email]],
      phone: [this.phone, [Validators.required, Validators.pattern(/^\d{10}$/)]],
      password: [this.password, [Validators.required, Validators.minLength(8) , passwordStrengthValidator ]],
      verifyPassword: [this.verifyPassword, Validators.required]
    }, {validator: this.passwordMatchValidator })
  }

  getRoles(){
    this.dataService.getRoles({}).subscribe((response) => {
      this.roles = response.data
    })
  }

  getAvatars(){
    this.dataService.getAvatars({}).subscribe((response) => {
      this.avatars = response.data
    })
  }

  nextAvatar() {
    this.activeIndex = (this.activeIndex + 1) % this.avatars.length;
  }

  prevAvatar() {
    this.activeIndex = (this.activeIndex - 1 + this.avatars.length) % this.avatars.length;
  }

  get selectedAvatar() {
    return this.avatars[this.activeIndex];
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

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const verifyPassword = form.get('verifyPassword')?.value;
    if (password !== verifyPassword) {
      form.get('verifyPassword')?.setErrors({ mismatch: true });
    } else {
      form.get('verifyPassword')?.setErrors(null);
    }
  }

  submit(){
    if (this.creationForm.invalid){
      this.messageService.add({severity: 'success', summary: 'Success!', detail: 'Η φόρμα σας δεν είναι έγκυρη, παρακαλώ όλα τα υποχρεωτικά όλα τα υποχρεωτικά πεδία'})
      this.validateAllFromFields(this.creationForm);
      this.submitted = true;
      return;
    }
    this.loading = true;

    const selectedRole = this.creationForm.get('role')?.value;
    const selectedAvatar = this.creationForm.get('avatar')?.value;
    const name = this.creationForm.get('name')?.value;
    const email = this.creationForm.get('email')?.value;
    const password = this.creationForm.get('password')?.value;
    const phone = this.creationForm.get('phone')?.value;
    const username = this.creationForm.get('username')?.value;
    const surname = this.creationForm.get('surname')?.value;

    this.dataService.createUser({selectedAvatar: selectedAvatar, selectedRole: selectedRole, name: name, email: email, password: password, phone: phone, username: username, surname: surname}).subscribe((r: any) =>{
      this.loading = false;
      if(r.status == 'success'){
        this.messageService.add({severity: 'success', summary: 'Success!', detail: r.message});
        this.router.navigate(['/login']);
      }else {
        this.messageService.add({severity: 'error', summary: 'Error!', detail: r.message});
        this.loading = false;
      }
    }, (error: any) => {
      this.messageService.add({severity: 'error', summary: 'Error!', detail: 'Κάτι πήγε λάθος, παρακαλώ προσπαθήστε ξανά αργότερα'});
      this.loading = false;
    })
  }

  changeLanguage(lang: string) {
    this.translate.use(lang);
  }

}