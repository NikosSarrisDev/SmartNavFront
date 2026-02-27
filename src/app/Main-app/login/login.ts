import {Component, OnInit} from '@angular/core';
import {FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {RemoteDataService} from '../../remotedata.service';
import {MenuItem, MessageService} from 'primeng/api';
import {Toast} from 'primeng/toast';
import {AuthenticationService} from '../../auth.service';
import {DataService} from '../../data.service';
import {Router, RouterLink} from '@angular/router';
import {first} from 'rxjs';
import {FloatLabel} from 'primeng/floatlabel';
import {CommonModule, NgIf} from '@angular/common';
import {Button, ButtonDirective} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {PasswordModule} from 'primeng/password';
import {DividerModule} from 'primeng/divider';
import {InputText} from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { TranslateDirective, TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FloatLabel,
    NgIf,
    Button,
    Checkbox,
    FormsModule,
    PasswordModule,
    ProgressSpinnerModule,
    DividerModule,
    RouterLink,
    ButtonDirective,
    InputText,
    Toast,
    MenuModule,
    TranslatePipe,
    TranslateDirective
  ],
  templateUrl: './login.html',
  styleUrl: './login.css',
  providers: [MessageService]
})
export class Login implements OnInit{

  public loginForm!: FormGroup;
  rememberMe : boolean = false;
  loading: boolean = false;
  password: string = '';
  email: string = '';
  submitted: boolean = false;
  error = '';
  languages: MenuItem[] | undefined;

  constructor(private formBuilder: FormBuilder,
              private remoteDataService: RemoteDataService,
              private messageService: MessageService,
              public dataService: DataService,
              private router: Router,
              private authenticationService: AuthenticationService,
              private translate: TranslateService) {
  }

  ngOnInit() {
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

    this.loginForm = this.formBuilder.group({
      email: [this.email, [Validators.required, Validators.email]],
      password : [this.password, Validators.required],
      rememberMe : [this.rememberMe],
    })

    //Add the Event listener to disable the Enter key because of wrong focus
    addEventListener("keydown", (event:any) => {
      if(event.key == "Enter"){
        event.preventDefault();
      }
    })

    const currentUser = this.authenticationService.currentUser();
    if (currentUser){
      this.router.navigate([''])
    }

    //Handle the local storage values for remember password option
    const storedUserEmail : any = localStorage.getItem(this.remoteDataService.platform + '_rememberMe_email');
    const storedUserPassword : any = localStorage.getItem(this.remoteDataService.platform + '_rememberMe_password');

    if (localStorage.getItem(storedUserEmail) != null && localStorage.getItem(storedUserPassword) != null){
      this.password = storedUserPassword;
      this.email = storedUserEmail;
    }
  }

  onSubmit(){
    if(this.loginForm.invalid){
      this.messageService.add({severity: 'error', summary: 'error!', detail: 'Η φόρμα σας δεν είναι έγκυρη, παρακαλώ όλα τα υποχρεωτικά όλα τα υποχρεωτικά πεδία'})
      this.validateAllFromFields(this.loginForm);
      this.submitted = true;
      return;
    }
    this.loading = true;

    // Extract values from the form
    const email = this.loginForm.get('email')?.value;
    const password = this.loginForm.get('password')?.value;
    const rememberMe = this.loginForm.get('rememberMe')?.value;

    this.authenticationService.login(password,email)
      .pipe(first()).subscribe(
        (httpResponse: any) => {
          if (httpResponse.status == "success"){

            if(rememberMe){
              localStorage.setItem(this.remoteDataService.platform + '_rememberMe_password', this.password)
              localStorage.setItem(this.remoteDataService.platform + '_rememberMe_email',this.email)
            }
            this.messageService.add({severity: 'success', summary: 'Success!', detail: httpResponse.message});
            this.router.navigate([''])
          }else {
            this.messageService.add({severity: 'error', summary: 'error!', detail: httpResponse.message});
          }
          this.loading = false;
        },
      (error: any) => {
          this.error = error;
          this.loading = false;
      }
    )
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

  changeLanguage(lang: string) {
    this.translate.use(lang);
  }

  navigateToRegister(){
    this.router.navigate(['/register']);
  }
}