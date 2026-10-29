import { randomInt } from 'node:crypto';

export const IDENTITY_ADMIN = Symbol('IDENTITY_ADMIN');

export class IdentityError extends Error {
  constructor(
    readonly kind: 'not_configured' | 'exists' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

/** Création de comptes dans le fournisseur d'identité (Keycloak), avec un mot de passe provisoire. */
export interface IdentityAdmin {
  configured(): boolean;
  createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    temporaryPassword: string;
  }): Promise<{ id: string }>;
}

export interface KeycloakAdminOptions {
  /** Adresse du royaume : http://localhost:8080/realms/lenseignement */
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Client de l'API d'administration de Keycloak. Il se connecte avec un client de service
 * (client_credentials) qui n'a que le droit de gérer les comptes du royaume.
 */
export class KeycloakAdmin implements IdentityAdmin {
  private readonly fetch: typeof fetch;
  private readonly realmBase: string;
  private readonly adminBase: string;

  constructor(private readonly options: KeycloakAdminOptions) {
    this.fetch = options.fetchImpl ?? fetch;
    this.realmBase = options.issuerUrl.replace(/\/$/, '');
    this.adminBase = this.realmBase.replace('/realms/', '/admin/realms/');
  }

  configured(): boolean {
    return Boolean(this.options.clientSecret);
  }

  private async token(): Promise<string> {
    const res = await this.fetch(`${this.realmBase}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret ?? '',
      }),
    }).catch(() => undefined);
    if (!res?.ok) {
      throw new IdentityError(
        'failed',
        'Keycloak a refusé la connexion du client de service. Vérifiez son secret.',
      );
    }
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    temporaryPassword: string;
  }): Promise<{ id: string }> {
    if (!this.configured()) {
      throw new IdentityError(
        'not_configured',
        'La création de comptes n’est pas encore configurée dans Keycloak.',
      );
    }
    const token = await this.token();
    const res = await this.fetch(`${this.adminBase}/users`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: input.email,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: input.temporaryPassword, temporary: true }],
      }),
    }).catch(() => undefined);
    if (!res) throw new IdentityError('failed', 'Keycloak ne répond pas.');
    if (res.status === 409) {
      throw new IdentityError('exists', 'Un compte existe déjà avec cet e-mail.');
    }
    if (res.status === 403) {
      throw new IdentityError(
        'failed',
        'Le client de service n’a pas le droit de créer des comptes dans Keycloak.',
      );
    }
    const id = res.headers.get('location')?.split('/').pop();
    if (res.status !== 201 || !id) {
      throw new IdentityError('failed', 'Keycloak n’a pas pu créer le compte.');
    }
    return { id };
  }
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

/** Mot de passe provisoire lisible : 3 groupes de 4 caractères séparés par des tirets. */
export function temporaryPassword(): string {
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[randomInt(set.length)]).join('');
  return `${pick(UPPER, 1)}${pick(LOWER, 3)}-${pick(DIGITS, 4)}-${pick(LOWER, 2)}${pick(UPPER, 1)}${pick(DIGITS, 1)}`;
}
