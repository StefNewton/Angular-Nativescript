import { Component, OnInit } from '@angular/core';
require('nativescript-nodeify');
import { AuthService } from '@src/app/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {
  title = 'nativescript-angular';

  constructor() { }

  ngOnInit() {

  }
}
