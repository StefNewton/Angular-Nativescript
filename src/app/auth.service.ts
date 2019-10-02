import { throwError as observableThrowError, Observable, BehaviorSubject, Observer, observable, forkJoin, defer, from } from 'rxjs';
import { Injectable, OnInit, EventEmitter } from '@angular/core';
import { utils } from 'protractor';
import { finalize } from 'rxjs/operators';

require('nativescript-nodeify');

import { AmplifyService } from 'aws-amplify-angular';
import { Auth } from 'aws-amplify';
import { CognitoUser } from '@aws-amplify/auth';
import { CognitoUserSession, AuthenticationDetails } from 'amazon-cognito-identity-js';
import Amplify from 'aws-amplify';

export enum SubscriptionType {
  Basic,
  Plus,
  Enterprise
}

export interface ISignUpStatus {
  complete: boolean;
  url: string;
  iot?: boolean;
  subType?: SubscriptionType;
}

export class User {
  public userName: string;
  public region: string;
  public userId: string;
  public externalId: string;
  public emailAddress: string;
  public preferredOrgId: string;

  constructor(
    userName: string,
    region: string,
    externalId: string,
    emailAddress: string
  ) {
    this.userName = userName;
    this.region = region;
    this.externalId = externalId;
    this.emailAddress = emailAddress;
  }

  private initCode() {
  }

  serialize() {
    const serializedObj = {};
    for (const key of Object.keys(this)) {
      if (key === 'currentSession') {
        continue;
      }
      serializedObj[key] = this[key];
    }
    return serializedObj;
  }

  deserialize(input: any): User {
    this.userName = input.userName;
    this.region = input.region;
    this.userId = input.userId;
    this.externalId = input.externalId;
    this.emailAddress = input.emailAddress;
    this.preferredOrgId = input.preferredOrgId;
    this.initCode();
    return this;
  }

  public toString = (): string => {
    return JSON.stringify(this);
  }
}

export class SignUpStatus implements ISignUpStatus {
  complete: boolean;
  url: string;
  iot?: boolean;
  subType?: SubscriptionType;
  constructor() {
    this.complete = false;
    this.url = '';
    this.iot = false;
  }
}


export interface Callback {
  callback(message: string, result: any): void;
}

export interface ChallengeParameters {
  CODE_DELIVERY_DELIVERY_MEDIUM: string;
  CODE_DELIVERY_DESTINATION: string;
}

export enum SignInCallbackType {
  Success,
  Error,
  NewPasswordRequired,
  ResetPasswordRequired,
  MfaRequired,
  OrganizationRequired,
  SelectOrganization,
  ResumeOnboarding,
  NewGlobalUserCreated,
  FederatedAccountNotFound, // this is for when someone signs in with federated, but hasnt signed up yet
  SystmClientSignIn,
  UserNotConfirmed,
  UserNotFound,
  NotAuthorized
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  amplify: {
    Auth: {
      // REQUIRED only for Federated Authentication - Amazon Cognito Identity Pool ID
        // identityPoolId: AppConfig.settings.aws.identityPoolId,//'XX-XXXX-X:XXXXXXXX-XXXX-1234-abcd-1234567890ab',

        // REQUIRED - Amazon Cognito Region
        region: 'us-east-1', // 'XX-XXXX-X',

        // OPTIONAL - Amazon Cognito Federated Identity Pool Region
        // Required only if it's different from Amazon Cognito Region
        // identityPoolRegion: 'XX-XXXX-X',

        // OPTIONAL - Amazon Cognito User Pool ID
      // tslint:disable: max-line-length
      //  userPoolId: this.isGlobalAdmin.getValue() ? AppConfig.settings.aws.globalUserPoolId : AppConfig.settings.aws.userPoolId, // 'XX-XXXX-X_abcd1234',

        // OPTIONAL - Amazon Cognito Web Client ID (26-char alphanumeric string)
       // userPoolWebClientId: this.isGlobalAdmin.getValue() ? AppConfig.settings.aws.globalUserPoolClientId : AppConfig.settings.aws.userPoolClientId, // 'a1b2c3d4e5f6g7h8i9j0k1l2m3',

        // OPTIONAL - Enforce user authentication prior to accessing AWS resources or not
        // mandatorySignIn: false,

        // OPTIONAL - Configuration for cookie storage
        // Note: if the secure flag is set to true, then the cookie transmission requires a secure protocol
        // cookieStorage: {
        //   // REQUIRED - Cookie domain (only required if cookieStorage is provided)
        //   domain: '.yourdomain.com',
        //   // OPTIONAL - Cookie path
        //   path: '/',
        //   // OPTIONAL - Cookie expiration in days
        //   expires: 365,
        //   // OPTIONAL - Cookie secure flag
        //   // Either true or false, indicating if the cookie transmission requires a secure protocol (https).
        //   secure: false //true
        // },

        // OPTIONAL - customized storage object
        // storage: new MyStorage(),
      //  storage: new MyCognitoStorage((this.isGlobalAdmin.getValue() || this.isFederatedLogin.getValue()) ? false : this.commonService.getPersistLogin()),

        // OPTIONAL - Manually set the authentication flow type. Default is 'USER_SRP_AUTH'
        authenticationFlowType: 'USER_SRP_AUTH'// 'USER_PASSWORD_AUTH'
    }
  };
  private currentUser: BehaviorSubject<User>;
  private tempAuthUser: CognitoUser = null;

  constructor(private amplifyService: AmplifyService) {
    Amplify.configure(this.amplify);

  }

  //#region SignIn
  // tslint:disable: max-line-length
  signIn(username: string, password: string): Observable<SignInCallbackType> {// , callback: (error: Error, result?: any) => void, callbackMFA: () => void) {
    return Observable.create((observer: Observer<SignInCallbackType>) => {
      try {
        from(Auth.signIn(username.toLowerCase().trim(), password)).subscribe(
          (user) => {
            const cogUser = user as CognitoUser;
            this.tempAuthUser = cogUser;
            if (user.challengeName === 'SMS_MFA' || user.challengeName === 'SOFTWARE_TOKEN_MFA') {
              observer.next(SignInCallbackType.MfaRequired);
              observer.complete();
              return;
            } else if (user.challengeName === 'NEW_PASSWORD_REQUIRED') {
              observer.next(SignInCallbackType.NewPasswordRequired);
              observer.complete();
            } else if (user.challengeName === 'MFA_SETUP') {
              // This happens when the MFA method is TOTP
              // The user needs to setup the TOTP before using it
              // More info please check the Enabling MFA part
              Auth.setupTOTP(user);
            } else {
              cogUser.getSession((getSessionError, getSessionResult) => {
              });
              // The user directly signs in
            }
          },
          (error) => {
            if (error.code === 'UserNotConfirmedException') {
              // The error happens if the user didn't finish the confirmation step when signing up
              // In this case you need to resend the code and confirm the user
              // About how to resend the code and confirm the user, please check the signUp part

              observer.error(SignInCallbackType.UserNotConfirmed);
            } else if (error.code === 'PasswordResetRequiredException') {
              // The error happens when the password is reset in the Cognito console
              // In this case you need to call forgotPassword to reset the password
              // Please check the Forgot Password part.
              observer.next(SignInCallbackType.ResetPasswordRequired);
              observer.complete();
            } else if (error.code === 'NotAuthorizedException') {
              // The error happens when the incorrect password is provided
              observer.error(SignInCallbackType.NotAuthorized);
            } else if (error.code === 'UserNotFoundException') {
              observer.error(SignInCallbackType.UserNotFound);
              // The error happens when the supplied username/email does not exist in the Cognito user pool
            } else {
              observer.error(error);
            }
          }
        );

        // let authenticationDetails = new AuthenticationDetails(authenticationData);
        // this.cognitoService.setCognitoUser(this.cognitoService.buildCognitoUser(username));
        // this.cognitoService.getCognitoUser().authenticateUser(authenticationDetails, {
        //   newPasswordRequired: (userAttributes, requiredAttributes) => { observer.next(SignInCallbackType.NewPasswordRequired); observer.complete(); },
        //   onSuccess: result => this.onSignInSuccessWrapper(result, observer),
        //   onFailure: err => { observer.error(err); },
        //   mfaRequired: (challengeName, challengeParameters) => { observer.next(SignInCallbackType.MfaRequired); observer.complete(); }
        // });
      } catch (ex) {
        observer.error(ex);
        return;
      }
    });

  }

}
