import { Component } from '@angular/core';
import { AuthService } from './auth.service';

// const AWS = require('aws');

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {

  constructor(private authService: AuthService) {
    console.log(authService.signIn('snewton', 'Papervision123!'));
  }
}
