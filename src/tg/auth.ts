import { Api } from 'telegram';

import {
  getClient,
  getCredentials,
  persistSession,
  prepareLogin,
  startServices,
  type Credentials,
} from './client';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: any) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Drives GramJS' `signInUser` from a step-based UI. The UI awaits each step and
 * feeds back the code / password through the returned functions.
 */
export class LoginFlow {
  private codeStep = deferred<string>();
  private passwordStep = deferred<string>();
  private creds: Credentials;

  needsPassword = deferred<boolean>();
  done: Promise<Api.TypeUser>;

  constructor(creds: Credentials, phoneNumber: string) {
    this.creds = creds;
    this.done = this.run(phoneNumber);
  }

  private async run(phoneNumber: string): Promise<Api.TypeUser> {
    await prepareLogin(this.creds);
    const user = await getClient().signInUser(
      { apiId: this.creds.apiId, apiHash: this.creds.apiHash },
      {
        phoneNumber,
        phoneCode: async () => this.codeStep.promise,
        password: async () => {
          this.needsPassword.resolve(true);
          return this.passwordStep.promise;
        },
        onError: async (err) => {
          // Returning true aborts; we only abort on explicit cancel.
          if (err.message === 'AUTH_USER_CANCEL') return true;
          throw err;
        },
      },
    );
    await persistSession();
    await startServices();
    return user;
  }

  submitCode(code: string) {
    this.codeStep.resolve(code);
  }

  submitPassword(password: string) {
    this.passwordStep.resolve(password);
  }

  async cancel() {
    this.codeStep.reject(new Error('AUTH_USER_CANCEL'));
    this.passwordStep.reject(new Error('AUTH_USER_CANCEL'));
    await getClient().disconnect().catch(() => {});
  }
}

export function getMe() {
  return getCredentials();
}
